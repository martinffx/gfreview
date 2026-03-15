import type { CommentResult } from '../client/ForgeClient';
import type { PR, Discussion } from '../entity/Schemas';
import type { FormattedDiff } from '../service/DiffService';
import type { FormattedDiscussion } from '../service/DiscussionService';

export interface OutputOptions {
  json: boolean;
  verbose: boolean;
}

export const Output = {
  item<T>(data: T, formatter: (d: T) => string, opts: OutputOptions): void {
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(formatter(data));
    }
  },

  list<T>(data: T[], formatter: (d: T) => string, opts: OutputOptions): void {
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
    } else if (data.length === 0) {
      console.log('No items found.');
    } else {
      for (const item of data) {
        console.log(formatter(item));
      }
    }
  },

  error(error: Error, opts: OutputOptions): void {
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            error: {
              name: error.name,
              message: error.message,
              ...(opts.verbose && { stack: error.stack }),
            },
          },
          null,
          2,
        ),
      );
    } else {
      console.error(`\x1b[31mError: ${error.message}\x1b[0m`);
      if (opts.verbose && error.stack) {
        console.error(error.stack);
      }
    }
  },

  success(message: string): void {
    console.log(`\x1b[32m✓ ${message}\x1b[0m`);
  },

  formatPR(pr: PR): string {
    const stateColors: Record<string, string> = {
      opened: '\x1b[32m',
      merged: '\x1b[35m',
      closed: '\x1b[31m',
      locked: '\x1b[33m',
    };
    const color = stateColors[pr.state] ?? '\x1b[0m';
    const reset = '\x1b[0m';

    return `${color}${pr.state}${reset} !${pr.iid} ${pr.title} (${pr.sourceBranch} → ${pr.targetBranch})`;
  },

  formatPRList(prs: PR[]): string[] {
    return prs.map((pr) => this.formatPR(pr));
  },

  formatDiff(diff: FormattedDiff): string {
    const lines: string[] = [];
    lines.push(`\x1b[1m${diff.path}\x1b[0m`);

    for (const line of diff.lines) {
      const prefix =
        line.type === 'addition'
          ? '\x1b[32m+\x1b[0m'
          : line.type === 'deletion'
            ? '\x1b[31m-\x1b[0m'
            : ' ';
      const oldNum = line.oldNumber !== undefined ? String(line.oldNumber).padStart(4) : '    ';
      const newNum = line.newNumber !== undefined ? String(line.newNumber).padStart(4) : '    ';
      lines.push(`${oldNum} ${newNum} ${prefix} ${line.content}`);
    }

    return lines.join('\n');
  },

  formatDiscussion(discussion: FormattedDiscussion): string {
    const lines: string[] = [];
    const statusIcon = discussion.isResolved ? '✓' : '○';

    lines.push(`\x1b[1m${statusIcon} Discussion ${discussion.id.slice(0, 8)}\x1b[0m`);

    if (discussion.isInline && discussion.file) {
      lines.push(`  File: ${discussion.file}${discussion.line ? `:${discussion.line}` : ''}`);
    }

    for (const note of discussion.notes) {
      lines.push(`  ${note.author}: ${note.body}`);
    }

    return lines.join('\n');
  },

  formatComment(comment: CommentResult): string {
    return `${comment.file}:${comment.line} (${comment.side}) ${comment.body}`;
  },
};
