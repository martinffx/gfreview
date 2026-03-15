import type {
  PR,
  DiffVersion,
  Discussion,
  FileDiff,
} from '../entity/Schemas';

export interface CommentOptions {
  file: string;
  line: number;
  lineEnd?: number;
  side?: 'new' | 'old';
  body: string;
}

export interface CommentResult {
  id: string | number;
  file: string;
  line: number;
  lineEnd?: number;
  side: 'new' | 'old';
  body: string;
  createdAt?: string;
}

export interface ForgeClient {
  readonly forge: 'github' | 'gitlab';

  getProjectId(projectPath: string): Promise<string>;

  listPRs(projectId: string, opts: { state?: string; limit?: number }): Promise<PR[]>;
  getPR(projectId: string, mrIid: number): Promise<PR>;
  createPR(
    projectId: string,
    opts: {
      title: string;
      sourceBranch: string;
      targetBranch: string;
      description?: string;
      draft?: boolean;
    },
  ): Promise<PR>;
  approvePR(projectId: string, mrIid: number): Promise<void>;
  unapprovePR(projectId: string, mrIid: number): Promise<void>;
  mergePR(projectId: string, mrIid: number): Promise<void>;

  getDiff(projectId: string, mrIid: number): Promise<FileDiff[]>;
  getVersions(projectId: string, mrIid: number): Promise<DiffVersion>;

  startReview(projectId: string, mrIid: number): Promise<number | undefined>;
  addComment(projectId: string, mrIid: number, opts: CommentOptions): Promise<CommentResult>;
  listComments(projectId: string, mrIid: number): Promise<CommentResult[]>;
  submitReview(projectId: string, mrIid: number, opts?: { summary?: string }): Promise<void>;
  discardReview(projectId: string, mrIid: number): Promise<void>;

  listDiscussions(projectId: string, mrIid: number): Promise<Discussion[]>;
  resolveDiscussion(projectId: string, mrIid: number, discussionId: string): Promise<void>;
  unresolveDiscussion(projectId: string, mrIid: number, discussionId: string): Promise<void>;
}
