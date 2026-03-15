import type {
  PR,
  DiffVersion,
  Discussion,
  FileDiff,
  ReviewComment,
  ReviewSession,
} from '../entity/Schemas';
import type { ForgeClient, CommentOptions, CommentResult } from './ForgeClient';

import { ApiError, UserError } from '../Errors';
import { SessionStore } from '../session/SessionStore';

type GitHubClientOptions = {
  baseUrl: string;
  token: string;
};

export class GitHubClient implements ForgeClient {
  readonly forge = 'github' as const;
  private baseUrl: string;
  private token: string;

  constructor(opts: GitHubClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.token = opts.token;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      ...(method !== 'GET' && body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new ApiError(
        `GitHub API error: ${response.status} ${response.statusText}`,
        response.status,
        errorBody,
      );
    }

    if (response.status === 204) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return undefined as T;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return (await response.json()) as T;
  }

  private transformState(state: string): 'opened' | 'closed' | 'merged' | 'locked' {
    if (state === 'open') return 'opened';
    if (state === 'closed' || state === 'merged' || state === 'locked') return state;
    return 'closed';
  }

  private parseProjectId(projectId: string): { owner: string; repo: string } {
    const [owner, repo] = projectId.split('/');
    if (!owner || !repo) {
      throw new UserError(`Invalid project ID: ${projectId}. Expected 'owner/repo' format.`);
    }
    return { owner, repo };
  }

  async getProjectId(projectPath: string): Promise<string> {
    return projectPath;
  }

  async listPRs(projectId: string, opts: { state?: string; limit?: number }): Promise<PR[]> {
    const { owner, repo } = this.parseProjectId(projectId);
    const params = new URLSearchParams();
    if (opts.state) params.set('state', opts.state);
    if (opts.limit) params.set('per_page', String(opts.limit));

    const data = await this.request<
      Array<{
        id: number;
        number: number;
        title: string;
        state: string;
        head: { ref: string; sha: string };
        base: { ref: string; sha: string };
        user: { id: number; login: string; avatar_url?: string };
        html_url: string;
      }>
    >(`GET`, `/repos/${owner}/${repo}/pulls?${params.toString()}`);

    return data.map((pr) => ({
      id: pr.id,
      iid: pr.number,
      projectId: `${owner}/${repo}`,
      title: pr.title,
      state: this.transformState(pr.state),
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      author: {
        id: pr.user.id,
        username: pr.user.login,
        name: pr.user.login,
        avatarUrl: pr.user.avatar_url,
      },
      webUrl: pr.html_url,
      diffVersions: {
        headSha: pr.head.sha,
      },
    }));
  }

  async getPR(projectId: string, mrIid: number): Promise<PR> {
    const { owner, repo } = this.parseProjectId(projectId);

    const pr = await this.request<{
      id: number;
      number: number;
      title: string;
      state: string;
      head: { ref: string; sha: string };
      base: { ref: string; sha: string };
      user: { id: number; login: string; avatar_url?: string };
      html_url: string;
    }>('GET', `/repos/${owner}/${repo}/pulls/${mrIid}`);

    return {
      id: pr.id,
      iid: pr.number,
      projectId,
      title: pr.title,
      state: this.transformState(pr.state),
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      author: {
        id: pr.user.id,
        username: pr.user.login,
        name: pr.user.login,
        avatarUrl: pr.user.avatar_url,
      },
      webUrl: pr.html_url,
      diffVersions: {
        headSha: pr.head.sha,
      },
    };
  }

  async createPR(
    projectId: string,
    opts: {
      title: string;
      sourceBranch: string;
      targetBranch: string;
      description?: string;
      draft?: boolean;
    },
  ): Promise<PR> {
    const { owner, repo } = this.parseProjectId(projectId);

    const pr = await this.request<{
      id: number;
      number: number;
      title: string;
      state: string;
      head: { ref: string; sha: string };
      base: { ref: string; sha: string };
      user: { id: number; login: string; avatar_url?: string };
      html_url: string;
    }>('POST', `/repos/${owner}/${repo}/pulls`, {
      title: opts.title,
      head: opts.sourceBranch,
      base: opts.targetBranch,
      body: opts.description,
      draft: opts.draft,
    });

    return {
      id: pr.id,
      iid: pr.number,
      projectId: `${owner}/${repo}`,
      title: pr.title,
      state: 'opened',
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      author: {
        id: pr.user.id,
        username: pr.user.login,
        name: pr.user.login,
        avatarUrl: pr.user.avatar_url,
      },
      webUrl: pr.html_url,
      diffVersions: {
        headSha: pr.head.sha,
      },
    };
  }

  async approvePR(projectId: string, mrIid: number): Promise<void> {
    const { owner, repo } = this.parseProjectId(projectId);
    await this.request('POST', `/repos/${owner}/${repo}/pulls/${mrIid}/reviews`, {
      event: 'APPROVE',
    });
  }

  async unapprovePR(_projectId: string, _mrIid: number): Promise<void> {
    throw new UserError(
      'GitHub does not support removing approvals. Create a new review with a different event.',
    );
  }

  async mergePR(projectId: string, mrIid: number): Promise<void> {
    const { owner, repo } = this.parseProjectId(projectId);
    await this.request('PUT', `/repos/${owner}/${repo}/pulls/${mrIid}/merge`);
  }

  async getDiff(projectId: string, mrIid: number): Promise<FileDiff[]> {
    const { owner, repo } = this.parseProjectId(projectId);

    const files = await this.request<
      Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        changes: number;
        patch?: string;
        raw_url?: string;
        contents_url?: string;
      }>
    >('GET', `/repos/${owner}/${repo}/pulls/${mrIid}/files`);

    return files.map((file) => ({
      old_path: file.filename,
      new_path: file.filename,
      diff: file.patch ?? '',
      new_file: file.status === 'added',
      deleted_file: file.status === 'removed',
      renamed_file: file.status === 'renamed',
    }));
  }

  async getVersions(projectId: string, mrIid: number): Promise<DiffVersion> {
    const pr = await this.getPR(projectId, mrIid);
    return pr.diffVersions ?? { headSha: '' };
  }

  async startReview(projectId: string, mrIid: number): Promise<number | undefined> {
    const { owner, repo } = this.parseProjectId(projectId);

    const response = await this.request<{
      id: number;
    }>('POST', `/repos/${owner}/${repo}/pulls/${mrIid}/reviews`, {
      event: 'PENDING',
    });

    return response.id;
  }

  async addComment(projectId: string, mrIid: number, opts: CommentOptions): Promise<CommentResult> {
    const session = await SessionStore.read(projectId, mrIid);
    if (!session) {
      throw new UserError('No active review session. Run "gfreview review start" first.');
    }

    const comment: ReviewComment = {
      id: crypto.randomUUID(),
      file: opts.file,
      line: opts.line,
      lineEnd: opts.lineEnd,
      side: opts.side ?? 'new',
      body: opts.body,
    };

    const updatedSession: ReviewSession = {
      ...session,
      comments: [...(session.comments ?? []), comment],
    };

    await SessionStore.write(session.projectId, session.mrIid, updatedSession);

    return {
      id: comment.id ?? crypto.randomUUID(),
      file: comment.file,
      line: comment.line,
      lineEnd: comment.lineEnd,
      side: comment.side,
      body: comment.body,
    };
  }

  async listComments(projectId: string, mrIid: number): Promise<CommentResult[]> {
    const session = await SessionStore.read(projectId, mrIid);
    if (!session) {
      return [];
    }

    return (session.comments ?? []).map((c: ReviewComment) => ({
      id: c.id ?? '',
      file: c.file,
      line: c.line,
      lineEnd: c.lineEnd,
      side: c.side,
      body: c.body,
    }));
  }

  async submitReview(projectId: string, mrIid: number, opts?: { summary?: string }): Promise<void> {
    const { owner, repo } = this.parseProjectId(projectId);
    const session = await SessionStore.read(projectId, mrIid);

    if (!session || !session.comments?.length) {
      throw new UserError(
        'No comments to submit. Add comments with "gfreview review comment" first.',
      );
    }

    const reviewComments = session.comments.map((comment: ReviewComment) => ({
      path: comment.file,
      line: comment.line,
      side: comment.side === 'new' ? 'RIGHT' : 'LEFT',
      body: comment.body,
    }));

    await this.request('POST', `/repos/${owner}/${repo}/pulls/${mrIid}/reviews`, {
      body: opts?.summary ?? '',
      event: 'COMMENT',
      comments: reviewComments,
    });

    await SessionStore.delete(projectId, mrIid);
  }

  async discardReview(projectId: string, mrIid: number): Promise<void> {
    await SessionStore.delete(projectId, mrIid);
  }

  async listDiscussions(_projectId: string, _mrIid: number): Promise<Discussion[]> {
    return [];
  }

  async resolveDiscussion(
    _projectId: string,
    _mrIid: number,
    _discussionId: string,
  ): Promise<void> {
    throw new UserError('GitHub does not support resolving comments via API. Use the web UI.');
  }

  async unresolveDiscussion(
    _projectId: string,
    _mrIid: number,
    _discussionId: string,
  ): Promise<void> {
    throw new UserError('GitHub does not support resolving comments via API. Use the web UI.');
  }

  async addNote(projectId: string, mrIid: number, opts: { body: string }): Promise<void> {
    const { owner, repo } = this.parseProjectId(projectId);
    await this.request('POST', `/repos/${owner}/${repo}/issues/${mrIid}/comments`, {
      body: opts.body,
    });
  }
}
