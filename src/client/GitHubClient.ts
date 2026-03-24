import type {
  PR,
  DiffVersion,
  Discussion,
  FileDiff,
} from '../entity/Schemas';
import type {
  ForgeClient,
  CommentOptions,
  CommentResult,
  PendingReview,
} from './ForgeClient';

import { ApiError, UserError } from '../Errors';

const GITHUB_BODY_MAX_LENGTH = 65536;
const SEVERITY_PREFIXES = {
  blocker: '[BLOCKER]',
  issue: '[ISSUE]',
  suggestion: '[SUGGESTION]',
  nit: '[NIT]',
} as const;

type GitHubUser = {
  id: number;
  login: string;
};

type GitHubReview = {
  id: number;
  user: { id: number; login: string };
  state: string;
  body: string | null;
  submitted_at: string | null;
};

type GitHubReviewComment = {
  id: number;
  path: string;
  line: number | null;
  side: string | null;
  body: string;
  created_at: string;
  pull_request_review_id: number | null;
};

type GitHubIssueComment = {
  id: number;
  body: string;
  created_at: string;
  user: { id: number; login: string };
};

type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  state: string;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  user: { id: number; login: string; avatar_url?: string };
  html_url: string;
};

type GitHubPRFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

type GitHubErrorResponse = {
  message?: string;
  errors?: Array<{ resource?: string; field?: string; code?: string; message?: string }>;
};

export class GitHubClient implements ForgeClient {
  readonly forge = 'github' as const;
  private baseUrl: string;
  private token: string;
  private currentUser: GitHubUser | null = null;

  constructor(opts: { baseUrl: string; token: string }) {
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
      const parsedError = this.parseErrorResponse(errorBody, response.status);
      throw new ApiError(
        parsedError.message,
        response.status,
        parsedError.details,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private parseErrorResponse(
    errorBody: string,
    status: number,
  ): { message: string; details?: unknown } {
    try {
      const parsed = JSON.parse(errorBody);
      if (typeof parsed !== 'object' || parsed === null) {
        return { message: `GitHub API error: ${status}` };
      }
      const p = parsed as GitHubErrorResponse;
      const errors = p.errors ?? [];

      if (status === 422) {
        const bodyLengthError = errors.find(
          (e) =>
            e.message?.toLowerCase().includes('body') &&
            e.message?.toLowerCase().includes('too long'),
        );
        if (bodyLengthError?.message) {
          return {
            message: `Validation failed: ${bodyLengthError.message}`,
            details: parsed.errors,
          };
        }

        if (errors.length > 0) {
          return {
            message: `Validation failed: ${errors.map((e) => e.message || `${e.field}: ${e.code}`).join('; ')}`,
            details: parsed.errors,
          };
        }
      }

      return {
        message: parsed.message || `GitHub API error: ${status}`,
        details: parsed.errors,
      };
    } catch {
      return { message: `GitHub API error: ${status}` };
    }
  }

  private transformState(
    state: string,
  ): 'opened' | 'closed' | 'merged' | 'locked' {
    if (state === 'open') return 'opened';
    if (state === 'closed' || state === 'merged' || state === 'locked')
      return state;
    return 'closed';
  }

  private parseProjectId(
    projectId: string,
  ): { owner: string; repo: string } {
    const [owner, repo] = projectId.split('/');
    if (!owner || !repo) {
      throw new UserError(
        `Invalid project ID: ${projectId}. Expected 'owner/repo' format.`,
      );
    }
    return { owner, repo };
  }

  async getCurrentUser(): Promise<GitHubUser> {
    if (this.currentUser) return this.currentUser;

    const user = await this.request<GitHubUser>('GET', '/user');
    this.currentUser = user;
    return user;
  }

  async getProjectId(projectPath: string): Promise<string> {
    return projectPath;
  }

  async listPRs(
    projectId: string,
    opts: { state?: string; limit?: number },
  ): Promise<PR[]> {
    const { owner, repo } = this.parseProjectId(projectId);
    const params = new URLSearchParams();
    if (opts.state) params.set('state', opts.state);
    if (opts.limit) params.set('per_page', String(opts.limit));

    const data = await this.request<GitHubPullRequest[]>(
      'GET',
      `/repos/${owner}/${repo}/pulls?${params.toString()}`,
    );

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

    const pr = await this.request<GitHubPullRequest>(
      'GET',
      `/repos/${owner}/${repo}/pulls/${mrIid}`,
    );

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

    const pr = await this.request<GitHubPullRequest>('POST', `/repos/${owner}/${repo}/pulls`, {
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

    const files = await this.request<GitHubPRFile[]>(
      'GET',
      `/repos/${owner}/${repo}/pulls/${mrIid}/files`,
    );

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

  async getPendingReview(
    projectId: string,
    mrIid: number,
  ): Promise<PendingReview | null> {
    const { owner, repo } = this.parseProjectId(projectId);
    const currentUser = await this.getCurrentUser();

    const reviews = await this.request<GitHubReview[]>(
      'GET',
      `/repos/${owner}/${repo}/pulls/${mrIid}/reviews`,
    );

    const pendingReview = reviews.find(
      (r) => r.state === 'PENDING' && r.user.id === currentUser.id,
    );

    if (!pendingReview) return null;

    return {
      id: pendingReview.id,
      userId: pendingReview.user.id,
      state: 'PENDING',
      submittedAt: pendingReview.submitted_at,
    };
  }

  async startReview(projectId: string, mrIid: number): Promise<number | undefined> {
    const existingReview = await this.getPendingReview(projectId, mrIid);
    if (existingReview) {
      return existingReview.id;
    }

    const { owner, repo } = this.parseProjectId(projectId);
    const pr = await this.getPR(projectId, mrIid);

    const response = await this.request<GitHubReview>(
      'POST',
      `/repos/${owner}/${repo}/pulls/${mrIid}/reviews`,
      {
        commit_id: pr.diffVersions?.headSha,
        event: 'PENDING',
      },
    );

    return response.id;
  }

  private formatBody(body: string, severity?: 'blocker' | 'issue' | 'suggestion' | 'nit'): string {
    if (severity && SEVERITY_PREFIXES[severity]) {
      return `${SEVERITY_PREFIXES[severity]} ${body}`;
    }
    return body;
  }

  async addComment(
    projectId: string,
    mrIid: number,
    opts: CommentOptions,
  ): Promise<CommentResult> {
    if (opts.body.length > GITHUB_BODY_MAX_LENGTH) {
      throw new UserError(
        `Comment body exceeds GitHub's ${GITHUB_BODY_MAX_LENGTH} character limit (${opts.body.length} characters).`,
      );
    }

    if (!opts.file || opts.line === undefined) {
      return this.addGeneralComment(projectId, mrIid, opts);
    }

    return this.addLineComment(projectId, mrIid, opts);
  }

  private async addLineComment(
    projectId: string,
    mrIid: number,
    opts: CommentOptions,
  ): Promise<CommentResult> {
    const { owner, repo } = this.parseProjectId(projectId);
    const pendingReview = await this.getPendingReview(projectId, mrIid);

    if (!pendingReview) {
      throw new UserError(
        `No pending review for PR #${mrIid}. Run "gfreview review start ${mrIid}" to start a review.`,
      );
    }

    const pr = await this.getPR(projectId, mrIid);
    const formattedBody = this.formatBody(opts.body, opts.severity);

    const comment = await this.request<GitHubReviewComment>(
      'POST',
      `/repos/${owner}/${repo}/pulls/${mrIid}/comments`,
      {
        body: formattedBody,
        commit_id: pr.diffVersions?.headSha,
        path: opts.file,
        line: opts.line,
        side: opts.side === 'old' ? 'LEFT' : 'RIGHT',
        pull_request_review_id: pendingReview.id,
      },
    );

    return {
      id: comment.id,
      file: comment.path,
      line: comment.line ?? undefined,
      side: comment.side === 'LEFT' ? 'old' : 'new',
      body: comment.body,
      createdAt: comment.created_at,
    };
  }

  private async addGeneralComment(
    projectId: string,
    mrIid: number,
    opts: CommentOptions,
  ): Promise<CommentResult> {
    const { owner, repo } = this.parseProjectId(projectId);
    const formattedBody = this.formatBody(opts.body, opts.severity);

    const comment = await this.request<GitHubIssueComment>(
      'POST',
      `/repos/${owner}/${repo}/issues/${mrIid}/comments`,
      { body: formattedBody },
    );

    return {
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      isGeneralComment: true,
    };
  }

  async listComments(projectId: string, mrIid: number): Promise<CommentResult[]> {
    const { owner, repo } = this.parseProjectId(projectId);
    const pendingReview = await this.getPendingReview(projectId, mrIid);

    const reviewComments = await this.request<GitHubReviewComment[]>(
      'GET',
      `/repos/${owner}/${repo}/pulls/${mrIid}/comments`,
    );

    const issueComments = await this.request<GitHubIssueComment[]>(
      'GET',
      `/repos/${owner}/${repo}/issues/${mrIid}/comments`,
    );

    const currentUser = await this.getCurrentUser();

    const pendingComments = reviewComments
      .filter((c) => c.pull_request_review_id === pendingReview?.id)
      .map((c) => ({
        id: c.id,
        file: c.path,
        line: c.line ?? undefined,
        side: (c.side === 'LEFT' ? 'old' : 'new') as 'old' | 'new',
        body: c.body,
        createdAt: c.created_at,
      }));

    const generalComments = issueComments
      .filter((c) => c.user.id === currentUser.id)
      .map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.created_at,
        isGeneralComment: true,
      }));

    return [...pendingComments, ...generalComments];
  }

  async submitReview(
    projectId: string,
    mrIid: number,
    opts?: { summary?: string },
  ): Promise<void> {
    const { owner, repo } = this.parseProjectId(projectId);
    const pendingReview = await this.getPendingReview(projectId, mrIid);

    if (!pendingReview) {
      throw new UserError(
        `No pending review for PR #${mrIid}. Run "gfreview review start ${mrIid}" to start a review.`,
      );
    }

    await this.request('POST', `/repos/${owner}/${repo}/pulls/${mrIid}/reviews/${pendingReview.id}/events`, {
      event: 'COMMENT',
      body: opts?.summary ?? '',
    });
  }

  async discardReview(projectId: string, mrIid: number): Promise<void> {
    const pendingReview = await this.getPendingReview(projectId, mrIid);

    if (!pendingReview) {
      return;
    }

    const { owner, repo } = this.parseProjectId(projectId);

    await this.request(
      'DELETE',
      `/repos/${owner}/${repo}/pulls/${mrIid}/reviews/${pendingReview.id}`,
    );
  }

  async listDiscussions(_projectId: string, _mrIid: number): Promise<Discussion[]> {
    return [];
  }

  async resolveDiscussion(
    _projectId: string,
    _mrIid: number,
    _discussionId: string,
  ): Promise<void> {
    throw new UserError(
      'GitHub does not support resolving comments via API. Use the web UI.',
    );
  }

  async unresolveDiscussion(
    _projectId: string,
    _mrIid: number,
    _discussionId: string,
  ): Promise<void> {
    throw new UserError(
      'GitHub does not support resolving comments via API. Use the web UI.',
    );
  }

  async addNote(projectId: string, mrIid: number, opts: { body: string }): Promise<void> {
    await this.addGeneralComment(projectId, mrIid, { body: opts.body });
  }
}
