import { test, expect, describe } from 'bun:test';

import type { DiffVersion, ReviewSession, FileDiff, ReviewComment } from './Schemas';

import {
  isStale,
  parseDiffHunks,
  buildLineMap,
  createGitLabPosition,
  createGitLabLineRange,
} from './Transforms';

describe('isStale', () => {
  const baseSession: ReviewSession = {
    projectId: 'owner/repo',
    mrIid: 1,
    startedAt: '2024-01-01T00:00:00Z',
    versions: { headSha: 'abc123' },
    reviewId: 1,
    comments: [],
  };

  test('returns false when headSha matches', () => {
    const currentVersions: DiffVersion = { headSha: 'abc123' };
    expect(isStale(baseSession, currentVersions)).toBe(false);
  });

  test('returns true when headSha differs', () => {
    const currentVersions: DiffVersion = { headSha: 'xyz789' };
    expect(isStale(baseSession, currentVersions)).toBe(true);
  });

  test('compares baseSha for GitLab', () => {
    const gitlabSession: ReviewSession = {
      ...baseSession,
      versions: { headSha: 'abc', baseSha: 'def', startSha: 'ghi' },
    };
    const currentVersions: DiffVersion = { headSha: 'abc', baseSha: 'changed', startSha: 'ghi' };

    expect(isStale(gitlabSession, currentVersions)).toBe(true);
  });

  test('compares startSha for GitLab', () => {
    const gitlabSession: ReviewSession = {
      ...baseSession,
      versions: { headSha: 'abc', baseSha: 'def', startSha: 'ghi' },
    };
    const currentVersions: DiffVersion = { headSha: 'abc', baseSha: 'def', startSha: 'changed' };

    expect(isStale(gitlabSession, currentVersions)).toBe(true);
  });

  test('handles missing optional SHAs', () => {
    const sessionWithOptional: ReviewSession = {
      ...baseSession,
      versions: { headSha: 'abc', baseSha: 'def' },
    };
    const currentVersions: DiffVersion = { headSha: 'abc', baseSha: 'def' };

    expect(isStale(sessionWithOptional, currentVersions)).toBe(false);
  });
});

describe('parseDiffHunks', () => {
  test('parses single hunk', () => {
    const diff = `@@ -1,3 +1,4 @@
 old line 1
-old line 2
+new line 2
+new line 3
 old line 3`;

    const hunks = parseDiffHunks(diff);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toEqual({
      old_start: 1,
      old_lines: 3,
      new_start: 1,
      new_lines: 4,
      content: expect.stringContaining('old line'),
    });
  });

  test('parses multiple hunks', () => {
    const diff = `@@ -1,2 +1,2 @@
 context
 deletion
@@ -10,2 +10,3 @@
 context
+addition`;

    const hunks = parseDiffHunks(diff);

    expect(hunks).toHaveLength(2);
    expect(hunks[0]?.old_start).toBe(1);
    expect(hunks[1]?.old_start).toBe(10);
  });

  test('handles empty diff', () => {
    const hunks = parseDiffHunks('');
    expect(hunks).toHaveLength(0);
  });
});

describe('buildLineMap', () => {
  test('maps line numbers correctly', () => {
    const fileDiff: FileDiff = {
      old_path: 'test.ts',
      new_path: 'test.ts',
      diff: `@@ -1,2 +1,3 @@
 context line
-deleted line
+added line
+another added`,
      new_file: false,
      deleted_file: false,
      renamed_file: false,
    };

    const map = buildLineMap(fileDiff);

    expect(map.size).toBeGreaterThan(0);
    const entries = Array.from(map.entries());
    const contextEntry = entries.find(([, v]) => v.type === 'context');
    expect(contextEntry).toBeDefined();
  });

  test('uses pre-parsed hunks if available', () => {
    const fileDiff: FileDiff = {
      old_path: 'test.ts',
      new_path: 'test.ts',
      diff: '',
      new_file: false,
      deleted_file: false,
      renamed_file: false,
      hunks: [
        {
          old_start: 1,
          old_lines: 1,
          new_start: 1,
          new_lines: 1,
          content: '@@ -1,1 +1,1 @@\n context line',
        },
      ],
    };

    const map = buildLineMap(fileDiff);

    expect(map.size).toBe(1);
  });
});

describe('createGitLabPosition', () => {
  test('creates position for new side', () => {
    const versions: DiffVersion = { headSha: 'head123', baseSha: 'base123', startSha: 'start123' };
    const comment: ReviewComment = {
      file: 'src/index.ts',
      line: 42,
      side: 'new',
      body: 'Test comment',
    };

    const position = createGitLabPosition(versions, comment);

    expect(position.head_sha).toBe('head123');
    expect(position.base_sha).toBe('base123');
    expect(position.start_sha).toBe('start123');
    expect(position.new_path).toBe('src/index.ts');
    expect(position.new_line).toBe(42);
    expect(position.old_line).toBeUndefined();
  });

  test('creates position for old side', () => {
    const versions: DiffVersion = { headSha: 'head123', baseSha: 'base123', startSha: 'start123' };
    const comment: ReviewComment = {
      file: 'src/index.ts',
      line: 42,
      side: 'old',
      body: 'Test comment',
    };

    const position = createGitLabPosition(versions, comment);

    expect(position.old_path).toBe('src/index.ts');
    expect(position.old_line).toBe(42);
    expect(position.new_line).toBeUndefined();
  });

  test('falls back headSha for missing optional SHAs', () => {
    const versions: DiffVersion = { headSha: 'head123' };
    const comment: ReviewComment = { file: 'test.ts', line: 1, side: 'new', body: 'hi' };

    const position = createGitLabPosition(versions, comment);

    expect(position.base_sha).toBe('head123');
    expect(position.start_sha).toBe('head123');
  });
});

describe('createGitLabLineRange', () => {
  test('creates line range when lineEnd is provided', () => {
    const comment: ReviewComment = {
      file: 'test.ts',
      line: 10,
      lineEnd: 15,
      side: 'new',
      body: 'Multi-line',
    };

    const range = createGitLabLineRange(comment, 'new');

    expect(range).not.toBeUndefined();
    expect(range?.start.new_line).toBe(10);
    expect(range?.end.new_line).toBe(15);
  });

  test('returns undefined when lineEnd is not provided', () => {
    const comment: ReviewComment = {
      file: 'test.ts',
      line: 10,
      side: 'new',
      body: 'Single line',
    };

    const range = createGitLabLineRange(comment, 'new');

    expect(range).toBeUndefined();
  });

  test('uses old line for old side', () => {
    const comment: ReviewComment = {
      file: 'test.ts',
      line: 10,
      lineEnd: 15,
      side: 'old',
      body: 'Multi-line old',
    };

    const range = createGitLabLineRange(comment, 'old');

    expect(range?.start.old_line).toBe(10);
    expect(range?.end.old_line).toBe(15);
  });
});
