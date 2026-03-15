import type { ForgeClient } from '../client/ForgeClient';
import type { Discussion } from '../entity/Schemas';

export interface DiscussionServiceOptions {
  client: ForgeClient;
  projectId: string;
  mrIid: number;
}

export interface FormattedDiscussion {
  id: string;
  isResolved: boolean;
  isInline: boolean;
  file?: string;
  line?: number;
  notes: Array<{
    author: string;
    body: string;
    createdAt: string;
    isDraft?: boolean;
  }>;
}

export const DiscussionService = {
  async list(opts: DiscussionServiceOptions): Promise<FormattedDiscussion[]> {
    const discussions = await opts.client.listDiscussions(opts.projectId, opts.mrIid);

    return discussions.map((d) => this.formatDiscussion(d));
  },

  formatDiscussion(discussion: Discussion): FormattedDiscussion {
    const firstNote = discussion.notes[0];
    const isInline =
      firstNote?.position?.new_path !== undefined || firstNote?.position?.old_path !== undefined;

    return {
      id: discussion.id,
      isResolved: firstNote?.resolved ?? false,
      isInline,
      file: firstNote?.position?.new_path ?? firstNote?.position?.old_path,
      line: firstNote?.position?.new_line ?? firstNote?.position?.old_line,
      notes: discussion.notes.map((n) => ({
        author: n.author.username,
        body: n.body,
        createdAt: n.created_at,
      })),
    };
  },

  formatForDisplay(discussions: FormattedDiscussion[]): string {
    const lines: string[] = [];

    if (discussions.length === 0) {
      return 'No comments found.';
    }

    for (const d of discussions) {
      const statusIcon = d.isResolved ? '✓' : '○';
      const typeLabel = d.isInline ? 'inline' : 'general';

      lines.push(`\x1b[1m${statusIcon} Comment ${d.id.slice(0, 8)}\x1b[0m (${typeLabel})`);

      if (d.isInline && d.file) {
        lines.push(`  File: ${d.file}${d.line ? `:${d.line}` : ''}`);
      }

      for (const note of d.notes) {
        lines.push(`  ${note.author}: ${note.body}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  },
};
