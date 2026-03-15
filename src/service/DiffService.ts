import type { ForgeClient } from '../client/ForgeClient';
import type { FileDiff, DiffHunk } from '../entity/Schemas';

import { parseDiffHunks } from '../entity/Transforms';

export interface DiffServiceOptions {
  client: ForgeClient;
  projectId: string;
  mrIid: number;
}

export interface FormattedDiff {
  path: string;
  oldPath: string;
  newPath: string;
  changeType: 'added' | 'deleted' | 'modified' | 'renamed';
  lines: DiffLine[];
}

export interface DiffLine {
  displayNumber: number;
  oldNumber?: number;
  newNumber?: number;
  content: string;
  type: 'context' | 'addition' | 'deletion';
}

export const DiffService = {
  async getDiff(opts: DiffServiceOptions): Promise<FormattedDiff[]> {
    const diffs = await opts.client.getDiff(opts.projectId, opts.mrIid);

    return diffs.map((d) => this.formatFileDiff(d));
  },

  formatFileDiff(fileDiff: FileDiff): FormattedDiff {
    const hunks = fileDiff.hunks ?? parseDiffHunks(fileDiff.diff);
    const lines: DiffLine[] = [];

    let displayNumber = 1;

    for (const hunk of hunks) {
      let oldLine = hunk.old_start;
      let newLine = hunk.new_start;

      const hunkLines = hunk.content.split('\n').slice(1);

      for (const line of hunkLines) {
        if (!line) continue;

        if (line.startsWith('+')) {
          lines.push({
            displayNumber: displayNumber++,
            newNumber: newLine++,
            content: line.slice(1),
            type: 'addition',
          });
        } else if (line.startsWith('-')) {
          lines.push({
            displayNumber: displayNumber++,
            oldNumber: oldLine++,
            content: line.slice(1),
            type: 'deletion',
          });
        } else if (line.startsWith(' ')) {
          lines.push({
            displayNumber: displayNumber++,
            oldNumber: oldLine,
            newNumber: newLine,
            content: line.slice(1),
            type: 'context',
          });
          oldLine++;
          newLine++;
        }
      }
    }

    let changeType: FormattedDiff['changeType'];
    if (fileDiff.new_file) {
      changeType = 'added';
    } else if (fileDiff.deleted_file) {
      changeType = 'deleted';
    } else if (fileDiff.renamed_file) {
      changeType = 'renamed';
    } else {
      changeType = 'modified';
    }

    return {
      path: fileDiff.new_path,
      oldPath: fileDiff.old_path,
      newPath: fileDiff.new_path,
      changeType,
      lines,
    };
  },

  formatForDisplay(diffs: FormattedDiff[]): string {
    const output: string[] = [];

    for (const diff of diffs) {
      output.push(this.formatDiffHeader(diff));
      output.push('');

      for (const line of diff.lines) {
        const prefix = this.getLinePrefix(line.type);
        const oldNum = line.oldNumber !== undefined ? String(line.oldNumber).padStart(4) : '    ';
        const newNum = line.newNumber !== undefined ? String(line.newNumber).padStart(4) : '    ';
        output.push(`${oldNum} ${newNum} ${prefix} ${line.content}`);
      }

      output.push('');
    }

    return output.join('\n');
  },

  formatDiffHeader(diff: FormattedDiff): string {
    const icon = this.getChangeIcon(diff.changeType);
    const path = diff.oldPath !== diff.newPath ? `${diff.oldPath} -> ${diff.newPath}` : diff.path;
    return `${icon} ${path}`;
  },

  getChangeIcon(type: FormattedDiff['changeType']): string {
    switch (type) {
      case 'added':
        return 'A';
      case 'deleted':
        return 'D';
      case 'renamed':
        return 'R';
      default:
        return 'M';
    }
  },

  getLinePrefix(type: DiffLine['type']): string {
    switch (type) {
      case 'addition':
        return '+';
      case 'deletion':
        return '-';
      default:
        return ' ';
    }
  },
};
