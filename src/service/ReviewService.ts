import type { ForgeClient, CommentOptions, CommentResult } from '../client/ForgeClient';

import { UserError } from '../Errors';

export type ReviewServiceOptions = {
  client: ForgeClient;
  projectId: string;
  mrIid: number;
};

export type ReviewStatus = {
  hasPendingReview: boolean;
  reviewId?: number;
  comments: CommentResult[];
};

export class ReviewService {
  constructor(private client: ForgeClient, private projectId: string, private mrIid: number) {}

  async startReview(): Promise<number | undefined> {
    return this.client.startReview(this.projectId, this.mrIid);
  }

  async getStatus(): Promise<ReviewStatus> {
    const pendingReview = await this.client.getPendingReview(this.projectId, this.mrIid);
    const comments = pendingReview
      ? await this.client.listComments(this.projectId, this.mrIid)
      : [];

    return {
      hasPendingReview: pendingReview !== null,
      reviewId: pendingReview?.id,
      comments,
    };
  }

  async addComment(commentOpts: CommentOptions): Promise<CommentResult> {
    const pendingReview = await this.client.getPendingReview(this.projectId, this.mrIid);

    if (!commentOpts.file && commentOpts.line === undefined) {
      return this.client.addComment(this.projectId, this.mrIid, commentOpts);
    }

    if (!pendingReview) {
      throw new UserError(
        `No pending review for PR #${this.mrIid}. Run "gfreview review start ${this.mrIid}" to start a review.`,
      );
    }

    return this.client.addComment(this.projectId, this.mrIid, commentOpts);
  }

  async submitReview(summary?: string): Promise<void> {
    const pendingReview = await this.client.getPendingReview(this.projectId, this.mrIid);

    if (!pendingReview) {
      throw new UserError(
        `No pending review for PR #${this.mrIid}. Run "gfreview review start ${this.mrIid}" to start a review.`,
      );
    }

    await this.client.submitReview(this.projectId, this.mrIid, { summary });
  }

  async discardReview(): Promise<void> {
    await this.client.discardReview(this.projectId, this.mrIid);
  }
}
