import type { ForgeClient, CommentOptions, CommentResult } from '../client/ForgeClient';
import type { ReviewSession, DiffVersion } from '../entity/Schemas';

import { isStale } from '../entity/Transforms';
import { StaleReviewError, UserError } from '../Errors';
import { SessionStore } from '../session/SessionStore';

export type ReviewServiceOptions = {
  client: ForgeClient;
  projectId: string;
  mrIid: number;
};

export type ReviewStatus = {
  session: ReviewSession | null;
  isStale: boolean;
  currentVersions: DiffVersion | null;
  comments: CommentResult[];
};

export const ReviewService = {
  async startReview(opts: ReviewServiceOptions): Promise<ReviewSession> {
    const existing = await SessionStore.read(opts.projectId, opts.mrIid);
    if (existing) {
      return existing;
    }

    const versions = await opts.client.getVersions(opts.projectId, opts.mrIid);

    const session: ReviewSession = {
      projectId: opts.projectId,
      mrIid: opts.mrIid,
      startedAt: new Date().toISOString(),
      versions,
      ...(opts.client.forge === 'github' ? { comments: [] } : { draftNoteIds: [] }),
    };

    await SessionStore.write(opts.projectId, opts.mrIid, session);

    return session;
  },

  async getStatus(opts: ReviewServiceOptions): Promise<ReviewStatus> {
    const session = await SessionStore.read(opts.projectId, opts.mrIid);

    if (!session) {
      return {
        session: null,
        isStale: false,
        currentVersions: null,
        comments: [],
      };
    }

    const currentVersions = await opts.client.getVersions(opts.projectId, opts.mrIid);
    const stale = isStale(session, currentVersions);

    const comments = await opts.client.listComments(opts.projectId, opts.mrIid);

    return {
      session,
      isStale: stale,
      currentVersions,
      comments,
    };
  },

  async addComment(
    opts: ReviewServiceOptions,
    commentOpts: CommentOptions,
  ): Promise<CommentResult> {
    const status = await this.getStatus(opts);

    if (!status.session) {
      throw new UserError('No active review session. Run "gfreview review start" first.');
    }

    if (status.isStale) {
      throw new StaleReviewError(
        'PR has been updated since review started. Run "gfreview review refresh" to update.',
        status.session.versions.headSha,
        status.currentVersions?.headSha ?? '',
      );
    }

    return opts.client.addComment(opts.projectId, opts.mrIid, commentOpts);
  },

  async submitReview(opts: ReviewServiceOptions, summary?: string): Promise<void> {
    const status = await this.getStatus(opts);

    if (!status.session) {
      throw new UserError('No active review session. Run "gfreview review start" first.');
    }

    if (status.isStale) {
      throw new StaleReviewError(
        'PR has been updated since review started. Run "gfreview review refresh" to update.',
        status.session.versions.headSha,
        status.currentVersions?.headSha ?? '',
      );
    }

    await opts.client.submitReview(opts.projectId, opts.mrIid, { summary });
  },

  async discardReview(opts: ReviewServiceOptions): Promise<void> {
    await opts.client.discardReview(opts.projectId, opts.mrIid);
  },

  async refreshReview(opts: ReviewServiceOptions): Promise<ReviewSession> {
    const status = await this.getStatus(opts);

    if (!status.session) {
      throw new UserError('No active review session. Run "gfreview review start" first.');
    }

    const currentVersions = await opts.client.getVersions(opts.projectId, opts.mrIid);

    const updatedSession: ReviewSession = {
      ...status.session,
      versions: currentVersions,
    };

    await SessionStore.write(opts.projectId, opts.mrIid, updatedSession);

    return updatedSession;
  },
};
