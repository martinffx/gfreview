import type { DiffVersion, FileDiff, DiffHunk, ReviewComment, ReviewSession } from './schemas';

export function isStale(session: ReviewSession, currentVersions: DiffVersion): boolean {
  const sessionHead = session.versions.headSha;
  const currentHead = currentVersions.headSha;
  if (sessionHead !== currentHead) {
    return true;
  }

  const sessionBase = session.versions.baseSha;
  const currentBase = currentVersions.baseSha;
  if (sessionBase !== undefined && currentBase !== undefined && sessionBase !== currentBase) {
    return true;
  }

  const sessionStart = session.versions.startSha;
  const currentStart = currentVersions.startSha;
  if (sessionStart !== undefined && currentStart !== undefined && sessionStart !== currentStart) {
    return true;
  }

  return false;
}

export function parseDiffHunks(diffContent: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const hunkRegex = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/gm;
  let match;

  while ((match = hunkRegex.exec(diffContent)) !== null) {
    const oldStart = match[1] ?? '0';
    const oldLines = match[2] ?? '0';
    const newStart = match[3] ?? '0';
    const newLines = match[4] ?? '0';
    hunks.push({
      old_start: parseInt(oldStart, 10),
      old_lines: parseInt(oldLines, 10),
      new_start: parseInt(newStart, 10),
      new_lines: parseInt(newLines, 10),
      content: extractHunkContent(diffContent, match.index ?? 0),
    });
  }

  return hunks;
}

function extractHunkContent(diff: string, startIndex: number): string {
  const lines = diff.slice(startIndex).split('\n');
  const hunkLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('@@') && hunkLines.length > 0) {
      break;
    }
    hunkLines.push(line);
  }

  return hunkLines.join('\n');
}

export interface LineMapping {
  oldLine: number | undefined;
  newLine: number | undefined;
  type: 'context' | 'addition' | 'deletion';
}

export function buildLineMap(fileDiff: FileDiff): Map<number, LineMapping> {
  const map = new Map<number, LineMapping>();
  const hunks = fileDiff.hunks ?? parseDiffHunks(fileDiff.diff);

  for (const hunk of hunks) {
    let oldLine = hunk.old_start;
    let newLine = hunk.new_start;

    const hunkLines = hunk.content.split('\n').slice(1);

    for (const line of hunkLines) {
      if (!line) continue;

      if (line.startsWith('+')) {
        map.set(newLine, { oldLine: undefined, newLine, type: 'addition' });
        newLine++;
      } else if (line.startsWith('-')) {
        map.set(oldLine, { oldLine, newLine: undefined, type: 'deletion' });
        oldLine++;
      } else if (line.startsWith(' ')) {
        map.set(newLine, { oldLine, newLine, type: 'context' });
        oldLine++;
        newLine++;
      }
    }
  }

  return map;
}

export interface GitLabPosition {
  base_sha: string;
  head_sha: string;
  start_sha: string;
  old_path: string;
  new_path: string;
  position_type: 'text';
  new_line?: number;
  old_line?: number;
}

export function createGitLabPosition(
  versions: DiffVersion,
  comment: ReviewComment,
): GitLabPosition {
  return {
    base_sha: versions.baseSha ?? versions.headSha,
    head_sha: versions.headSha,
    start_sha: versions.startSha ?? versions.headSha,
    old_path: comment.side === 'old' ? comment.file : '/dev/null',
    new_path: comment.side === 'new' ? comment.file : '/dev/null',
    position_type: 'text',
    new_line: comment.side === 'new' ? comment.line : undefined,
    old_line: comment.side === 'old' ? comment.line : undefined,
  };
}

export interface GitLabLineRange {
  start: {
    type: 'new' | 'old';
    old_line?: number;
    new_line?: number;
  };
  end: {
    type: 'new' | 'old';
    old_line?: number;
    new_line?: number;
  };
}

export function createGitLabLineRange(
  comment: ReviewComment,
  side: 'new' | 'old',
): GitLabLineRange | undefined {
  if (!comment.lineEnd) return undefined;

  return {
    start: {
      type: side,
      new_line: side === 'new' ? comment.line : undefined,
      old_line: side === 'old' ? comment.line : undefined,
    },
    end: {
      type: side,
      new_line: side === 'new' ? comment.lineEnd : undefined,
      old_line: side === 'old' ? comment.lineEnd : undefined,
    },
  };
}
