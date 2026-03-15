import { z } from 'zod';

export const DiffVersionSchema = z.object({
  headSha: z.string(),
  baseSha: z.string().optional(),
  startSha: z.string().optional(),
});
export type DiffVersion = z.infer<typeof DiffVersionSchema>;

export const PRSchema = z.object({
  id: z.number(),
  iid: z.number(),
  projectId: z.string(),
  title: z.string(),
  state: z.enum(['opened', 'closed', 'merged', 'locked']),
  sourceBranch: z.string(),
  targetBranch: z.string(),
  author: z.object({
    id: z.number(),
    username: z.string(),
    name: z.string(),
    avatarUrl: z.string().optional(),
  }),
  webUrl: z.string(),
  diffVersions: DiffVersionSchema.optional(),
});
export type PR = z.infer<typeof PRSchema>;

export const ReviewCommentSchema = z.object({
  id: z.string().optional(),
  file: z.string(),
  line: z.number().int().positive(),
  lineEnd: z.number().int().positive().optional(),
  side: z.enum(['new', 'old']).default('new'),
  body: z.string().min(1),
});
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

export const DraftNoteSchema = z.object({
  id: z.number(),
  position: z.object({
    base_sha: z.string(),
    head_sha: z.string(),
    start_sha: z.string(),
    old_path: z.string(),
    new_path: z.string(),
    position_type: z.enum(['text', 'image']),
    new_line: z.number().optional(),
    old_line: z.number().optional(),
    line_range: z
      .object({
        start: z.object({
          type: z.enum(['new', 'old']),
          old_line: z.number().optional(),
          new_line: z.number().optional(),
        }),
        end: z.object({
          type: z.enum(['new', 'old']),
          old_line: z.number().optional(),
          new_line: z.number().optional(),
        }),
      })
      .optional(),
  }),
  note: z.string(),
  author: z.object({
    id: z.number(),
    username: z.string(),
    name: z.string(),
  }),
  created_at: z.string(),
  resolvable: z.boolean().optional(),
  resolved: z.boolean().optional(),
});
export type DraftNote = z.infer<typeof DraftNoteSchema>;

export const DiscussionNoteSchema = z.object({
  id: z.number(),
  body: z.string(),
  author: z.object({
    id: z.number(),
    username: z.string(),
    name: z.string(),
  }),
  created_at: z.string(),
  position: z
    .object({
      base_sha: z.string().optional(),
      head_sha: z.string().optional(),
      start_sha: z.string().optional(),
      old_path: z.string().optional(),
      new_path: z.string().optional(),
      position_type: z.enum(['text', 'image']).optional(),
      new_line: z.number().optional(),
      old_line: z.number().optional(),
    })
    .optional(),
  resolvable: z.boolean().optional(),
  resolved: z.boolean().optional(),
});
export type DiscussionNote = z.infer<typeof DiscussionNoteSchema>;

export const DiscussionSchema = z.object({
  id: z.string(),
  notes: z.array(DiscussionNoteSchema),
});
export type Discussion = z.infer<typeof DiscussionSchema>;

export const DiffHunkSchema = z.object({
  old_start: z.number(),
  old_lines: z.number(),
  new_start: z.number(),
  new_lines: z.number(),
  content: z.string(),
});
export type DiffHunk = z.infer<typeof DiffHunkSchema>;

export const FileDiffSchema = z.object({
  old_path: z.string(),
  new_path: z.string(),
  diff: z.string(),
  new_file: z.boolean(),
  deleted_file: z.boolean(),
  renamed_file: z.boolean(),
  hunks: z.array(DiffHunkSchema).optional(),
});
export type FileDiff = z.infer<typeof FileDiffSchema>;

export const ReviewSessionSchema = z.object({
  projectId: z.string(),
  mrIid: z.number(),
  startedAt: z.string(),
  versions: DiffVersionSchema,
  reviewId: z.number().optional(),
  comments: z.array(ReviewCommentSchema).optional(),
  draftNoteIds: z.array(z.number()).optional(),
});
export type ReviewSession = z.infer<typeof ReviewSessionSchema>;

export const ConfigSchema = z.object({
  forge: z.enum(['github', 'gitlab']),
  token: z.string(),
  baseUrl: z.string().optional(),
  project: z.string().optional(),
});
export type Config = z.infer<typeof ConfigSchema>;
