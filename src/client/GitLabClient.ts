import type { PR, DiffVersion, Discussion, FileDiff } from '../entity/Schemas';
import type { ForgeClient, CommentOptions, CommentResult, PendingReview } from './ForgeClient';

import { ApiError, StaleReviewError, UserError } from '../Errors';

type GitLabClientOptions = {
  baseUrl: string;
  token: string;
};

type GitLabVersion = {
  id: number;
  head_commit_sha: string;
  base_commit_sha: string;
  start_commit_sha: string;
  created_at: string;
};

type GitLabDraftNote = {
  id: number;
  note: string;
  author: { id: number; username: string; name: string };
  created_at: string;
  position: {
    base_sha: string;
    head_sha: string;
    start_sha: string;
    old_path: string;
    new_path: string;
    position_type: 'text' | 'image';
    new_line?: number;
    old_line?: number;
    line_range?: {
      start: { type: 'new' | 'old'; old_line?: number; new_line?: number };
      end: { type: 'new' | 'old'; old_line?: number; new_line?: number };
    };
  };
  resolvable?: boolean;
  resolved?: boolean;
};

type GitLabDiscussion = {
  id: string;
  notes: Array<{
    id: number;
    body: string;
    author: { id: number; username: string; name: string };
    created_at: string;
    position?: {
      base_sha?: string;
      head_sha?: string;
      start_sha?: string;
      old_path?: string;
      new_path?: string;
      position_type?: 'text' | 'image';
      new_line?: number;
      old_line?: number;
    };
    resolvable?: boolean;
    resolved?: boolean;
  }>;
};

type GitLabMR = {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  state: string;
  source_branch: string;
  target_branch: string;
  author: { id: number; username: string; name: string; avatar_url?: string };
  web_url: string;
  diff_refs?: {
    head_sha: string;
    base_sha: string;
    start_sha: string;
  };
};

type GitLabFileDiff = {
  old_path: string;
  new_path: string;
  diff: string;
  new_file: boolean;
  deleted_file: boolean;
  renamed_file: boolean;
  patch?: string;
};

export class GitLabClient implements ForgeClient {
  readonly forge = 'gitlab' as const;
  private baseUrl: string;
  private token: string;
  private versionCache: Map<string, DiffVersion> = new Map();

  constructor(opts: GitLabClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.token = opts.token;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v4${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        'PRIVATE-TOKEN': this.token,
        'Content-Type': 'application/json',
      },
      ...(method !== 'GET' && body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorBody = await response.text();

      if (response.status === 400 && this.isStaleShaError(errorBody)) {
        throw new StaleReviewError(
          'The MR has been updated since you started the review. Run "gfreview review refresh" to update your session.',
          'cached',
          'current',
        );
      }

      throw new ApiError(
        `GitLab API error: ${response.status} ${response.statusText}`,
        response.status,
        errorBody,
      );
    }

    if (response.status === 204) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return undefined as unknown as T;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return (await response.json()) as T;
  }

  private isStaleShaError(body: string): boolean {
    const lower = body.toLowerCase();
    return (
      (lower.includes('position') || lower.includes('sha')) &&
      (lower.includes('invalid') ||
        lower.includes('outdated') ||
        lower.includes('cannot') ||
        lower.includes('error'))
    );
  }

  private encodeProjectId(projectId: string): string {
    return encodeURIComponent(projectId);
  }

  private async sha1(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async getCurrentUser(): Promise<{ id: number; login: string }> {
    const user = await this.request<{ id: number; username: string }>('GET', '/user');
    return { id: user.id, login: user.username };
  }

  async getPendingReview(_projectId: string, _mrIid: number): Promise<PendingReview | null> {
    return null;
  }

  async getProjectId(projectPath: string): Promise<string> {
    if (projectPath.includes('/')) {
      return projectPath;
    }

    const project = await this.request<{ path_with_namespace: string }>(
      'GET',
      `/projects/${projectPath}`,
    );

    return project.path_with_namespace;
  }

  async listPRs(projectId: string, opts: { state?: string; limit?: number }): Promise<PR[]> {
    const encodedId = this.encodeProjectId(projectId);
    const params = new URLSearchParams();
    if (opts.state) params.set('state', opts.state);
    if (opts.limit) params.set('per_page', opts.limit.toString());

    const query = params.toString() ? `?${params.toString()}` : '';
    const mrs = await this.request<GitLabMR[]>(
      'GET',
      `/projects/${encodedId}/merge_requests${query}`,
    );

    return mrs.map((m) => this.transformMR(m));
  }

  async getPR(projectId: string, mrIid: number): Promise<PR> {
    const encodedId = this.encodeProjectId(projectId);
    const mr = await this.request<GitLabMR>(
      'GET',
      `/projects/${encodedId}/merge_requests/${mrIid}`,
    );

    return this.transformMR(mr);
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
    const encodedId = this.encodeProjectId(projectId);
    const mr = await this.request<GitLabMR>('POST', `/projects/${encodedId}/merge_requests`, {
      title: opts.title,
      source_branch: opts.sourceBranch,
      target_branch: opts.targetBranch,
      description: opts.description,
      draft: opts.draft,
    });

    return this.transformMR(mr);
  }

  async approvePR(projectId: string, mrIid: number): Promise<void> {
    const encodedId = this.encodeProjectId(projectId);
    await this.request('POST', `/projects/${encodedId}/merge_requests/${mrIid}/approve`);
  }

  async unapprovePR(projectId: string, mrIid: number): Promise<void> {
    const encodedId = this.encodeProjectId(projectId);
    await this.request('POST', `/projects/${encodedId}/merge_requests/${mrIid}/unapprove`);
  }

  async mergePR(projectId: string, mrIid: number): Promise<void> {
    const encodedId = this.encodeProjectId(projectId);
    await this.request('PUT', `/projects/${encodedId}/merge_requests/${mrIid}/merge`);
  }

  async getDiff(projectId: string, mrIid: number): Promise<FileDiff[]> {
    const encodedId = this.encodeProjectId(projectId);
    const diffs = await this.request<GitLabFileDiff[]>(
      'GET',
      `/projects/${encodedId}/merge_requests/${mrIid}/diffs`,
    );

    return diffs.map((d) => ({
      old_path: d.old_path,
      new_path: d.new_path,
      diff: d.diff || d.patch || '',
      new_file: d.new_file,
      deleted_file: d.deleted_file,
      renamed_file: d.renamed_file,
    }));
  }

  async getVersions(projectId: string, mrIid: number): Promise<DiffVersion> {
    const cacheKey = `${projectId}:${mrIid}`;
    const cached = this.versionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const encodedId = this.encodeProjectId(projectId);
    const versions = await this.request<GitLabVersion[]>(
      'GET',
      `/projects/${encodedId}/merge_requests/${mrIid}/versions`,
    );

    const current = versions[0];
    if (!current) {
      throw new ApiError('No versions found for MR', 404, {});
    }

    const diffVersion: DiffVersion = {
      headSha: current.head_commit_sha,
      baseSha: current.base_commit_sha,
      startSha: current.start_commit_sha,
    };

    this.versionCache.set(cacheKey, diffVersion);
    return diffVersion;
  }

  async startReview(_projectId: string, _mrIid: number): Promise<undefined> {
    return undefined;
  }

  async addComment(projectId: string, mrIid: number, opts: CommentOptions): Promise<CommentResult> {
    const versions = await this.getVersions(projectId, mrIid);
    const encodedId = this.encodeProjectId(projectId);

    const position: Record<string, unknown> = {
      base_sha: versions.baseSha,
      head_sha: versions.headSha,
      start_sha: versions.startSha,
      old_path: opts.file,
      new_path: opts.file,
      position_type: 'text',
    };

    if (!opts.lineEnd) {
      if (opts.side === 'old') {
        position.old_line = opts.line;
      } else {
        position.new_line = opts.line;
      }
    } else {
      position.line_range = {
        start: {
          type: opts.side ?? 'new',
          ...(opts.side === 'old' ? { old_line: opts.line } : { new_line: opts.line }),
        },
        end: {
          type: opts.side ?? 'new',
          ...(opts.side === 'old' ? { old_line: opts.lineEnd } : { new_line: opts.lineEnd }),
        },
      };
    }

    const draftNote = await this.request<GitLabDraftNote>(
      'POST',
      `/projects/${encodedId}/merge_requests/${mrIid}/draft_notes`,
      {
        note: opts.body,
        position,
        resolvable: true,
      },
    );

    return this.draftNoteToCommentResult(draftNote);
  }

  async listComments(projectId: string, mrIid: number): Promise<CommentResult[]> {
    const encodedId = this.encodeProjectId(projectId);
    const draftNotes = await this.request<GitLabDraftNote[]>(
      'GET',
      `/projects/${encodedId}/merge_requests/${mrIid}/draft_notes`,
    );

    return draftNotes.map((n) => this.draftNoteToCommentResult(n));
  }

  async submitReview(projectId: string, mrIid: number, opts?: { summary?: string }): Promise<void> {
    const encodedId = this.encodeProjectId(projectId);
    await this.request(
      'POST',
      `/projects/${encodedId}/merge_requests/${mrIid}/draft_notes/bulk_publish`,
      opts?.summary ? { summary: opts.summary } : undefined,
    );

    this.versionCache.delete(`${projectId}:${mrIid}`);
  }

  async discardReview(projectId: string, mrIid: number): Promise<void> {
    const comments = await this.listComments(projectId, mrIid);
    const encodedId = this.encodeProjectId(projectId);

    for (const comment of comments) {
      await this.request(
        'DELETE',
        `/projects/${encodedId}/merge_requests/${mrIid}/draft_notes/${comment.id}`,
      );
    }

    this.versionCache.delete(`${projectId}:${mrIid}`);
  }

  async listDiscussions(projectId: string, mrIid: number): Promise<Discussion[]> {
    const encodedId = this.encodeProjectId(projectId);
    const discussions = await this.request<GitLabDiscussion[]>(
      'GET',
      `/projects/${encodedId}/merge_requests/${mrIid}/discussions`,
    );

    return discussions.map((d) => ({
      id: d.id,
      notes: d.notes.map((n) => ({
        id: n.id,
        body: n.body,
        author: n.author,
        created_at: n.created_at,
        position: n.position
          ? {
              base_sha: n.position.base_sha,
              head_sha: n.position.head_sha,
              start_sha: n.position.start_sha,
              old_path: n.position.old_path,
              new_path: n.position.new_path,
              position_type: n.position.position_type ?? 'text',
              new_line: n.position.new_line,
              old_line: n.position.old_line,
            }
          : undefined,
        resolvable: n.resolvable,
        resolved: n.resolved,
      })),
    }));
  }

  async resolveDiscussion(projectId: string, mrIid: number, discussionId: string): Promise<void> {
    const encodedId = this.encodeProjectId(projectId);
    await this.request('POST', `/projects/${encodedId}/merge_requests/${mrIid}/discussions`, {
      discussion: { resolve_id: discussionId },
    });
  }

  async unresolveDiscussion(projectId: string, mrIid: number, discussionId: string): Promise<void> {
    const discussions = await this.listDiscussions(projectId, mrIid);
    const discussion = discussions.find((d) => d.id === discussionId);

    if (!discussion || !discussion.notes[0]) {
      throw new UserError('Discussion not found');
    }

    const noteId = discussion.notes[0].id;
    const encodedId = this.encodeProjectId(projectId);
    await this.request('PUT', `/projects/${encodedId}/merge_requests/${mrIid}/notes/${noteId}`, {
      resolved: false,
    });
  }

  async addNote(projectId: string, mrIid: number, opts: { body: string }): Promise<void> {
    const encodedId = this.encodeProjectId(projectId);
    await this.request('POST', `/projects/${encodedId}/merge_requests/${mrIid}/notes`, {
      body: opts.body,
    });
  }

  private transformMR(mr: GitLabMR): PR {
    return {
      id: mr.id,
      iid: mr.iid,
      projectId: mr.project_id.toString(),
      title: mr.title,
      state: this.transformState(mr.state),
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      author: {
        id: mr.author.id,
        username: mr.author.username,
        name: mr.author.name,
        avatarUrl: mr.author.avatar_url,
      },
      webUrl: mr.web_url,
      diffVersions: mr.diff_refs
        ? {
            headSha: mr.diff_refs.head_sha,
            baseSha: mr.diff_refs.base_sha,
            startSha: mr.diff_refs.start_sha,
          }
        : undefined,
    };
  }

  private transformState(state: string): 'opened' | 'closed' | 'merged' | 'locked' {
    switch (state) {
      case 'opened':
        return 'opened';
      case 'closed':
        return 'closed';
      case 'merged':
        return 'merged';
      case 'locked':
        return 'locked';
      default:
        return 'opened';
    }
  }

  private draftNoteToCommentResult(note: GitLabDraftNote): CommentResult {
    const position = note.position;
    let lineEnd: number | undefined;

    if (position.line_range) {
      lineEnd = position.line_range.end.new_line ?? position.line_range.end.old_line ?? undefined;
    }

    return {
      id: note.id,
      file: position.new_path || position.old_path || '',
      line: position.new_line ?? position.old_line ?? 0,
      lineEnd,
      side: position.new_line ? 'new' : 'old',
      body: note.note,
      createdAt: note.created_at,
    };
  }
}
