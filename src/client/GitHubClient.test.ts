import { test, expect, describe, mock, beforeEach } from 'bun:test';

import { ApiError } from '../Errors';
import { GitHubClient } from './GitHubClient';

describe('GitHubClient', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFetch = mock<(...args: any[]) => any>();
  const client = new GitHubClient({
    baseUrl: 'https://api.github.com',
    token: 'test-token',
  });

  beforeEach(() => {
    mockFetch.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  describe('getVersions', () => {
    test('returns DiffVersion with headSha from PR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => ({
          id: 1,
          number: 42,
          title: 'Test PR',
          state: 'open',
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          user: { id: 1, login: 'testuser', avatar_url: 'https://example.com/avatar.png' },
          html_url: 'https://github.com/owner/repo/pull/42',
        }),
      });

      const versions = await client.getVersions('owner/repo', 42);

      expect(versions.headSha).toBe('abc123');
      expect(versions.baseSha).toBeUndefined();
      expect(versions.startSha).toBeUndefined();
    });
  });

  describe('getPR', () => {
    test('fetches and transforms PR data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => ({
          id: 1,
          number: 42,
          title: 'Test PR',
          state: 'open',
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          user: { id: 1, login: 'testuser', avatar_url: 'https://example.com/avatar.png' },
          html_url: 'https://github.com/owner/repo/pull/42',
        }),
      });

      const pr = await client.getPR('owner/repo', 42);

      expect(pr.iid).toBe(42);
      expect(pr.title).toBe('Test PR');
      expect(pr.state).toBe('opened');
      expect(pr.sourceBranch).toBe('feature');
      expect(pr.targetBranch).toBe('main');
      expect(pr.author.username).toBe('testuser');
    });

    test('transforms closed state correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => ({
          id: 1,
          number: 1,
          title: 'Closed PR',
          state: 'closed',
          head: { ref: 'feat', sha: 'abc' },
          base: { ref: 'main', sha: 'def' },
          user: { id: 1, login: 'user', avatar_url: '' },
          html_url: 'https://github.com/o/r/pull/1',
        }),
      });

      const pr = await client.getPR('owner/repo', 1);
      expect(pr.state).toBe('closed');
    });
  });

  describe('getDiff', () => {
    test('fetches file diffs and transforms to FileDiff', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => [
          {
            filename: 'src/index.ts',
            status: 'modified',
            additions: 5,
            deletions: 2,
            changes: 7,
            patch: '@@ -1,2 +1,3 @@\n old\n-deleted\n+added\n+added2',
          },
          {
            filename: 'src/new.ts',
            status: 'added',
            additions: 10,
            deletions: 0,
            changes: 10,
            patch: '@@ -0,0 +1,10 @@\n+new file content',
          },
        ],
      });

      const diffs = await client.getDiff('owner/repo', 42);

      expect(diffs).toHaveLength(2);
      expect(diffs[0]?.old_path).toBe('src/index.ts');
      expect(diffs[0]?.new_path).toBe('src/index.ts');
      expect(diffs[0]?.deleted_file).toBe(false);
      expect(diffs[1]?.new_file).toBe(true);
    });
  });

  describe('approvePR', () => {
    test('posts approve review event', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => ({}),
      });

      expect(client.approvePR('owner/repo', 42)).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/pulls/42/reviews',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ event: 'APPROVE' }),
        }),
      );
    });
  });

  describe('mergePR', () => {
    test('sends merge request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => ({}),
      });

      expect(client.mergePR('owner/repo', 42)).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/pulls/42/merge',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  describe('API errors', () => {
    test('throws ApiError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Not Found'),
      });

      expect(client.getPR('owner/repo', 999)).rejects.toThrow(ApiError);
    });

    test('includes status code in ApiError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Bad credentials'),
      });

      let thrown = false;
      try {
        await client.getPR('owner/repo', 1);
      } catch (e) {
        thrown = true;
        expect(e).toBeInstanceOf(ApiError);
        if (e instanceof ApiError) {
          expect(e.statusCode).toBe(401);
        }
      }
      expect(thrown).toBe(true);
    });
  });

  describe('project ID validation', () => {
    test('throws UserError for invalid project ID', () => {
      expect(() => client.getPR('invalid', 1)).toThrow(
        "Invalid project ID: invalid. Expected 'owner/repo' format.",
      );
    });

    test('throws UserError for missing repo', () => {
      expect(() => client.getPR('owner', 1)).toThrow(
        "Invalid project ID: owner. Expected 'owner/repo' format.",
      );
    });
  });

  describe('createPR', () => {
    test('creates PR with all options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => ({
          id: 123,
          number: 5,
          title: 'New PR',
          state: 'open',
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          user: { id: 1, login: 'testuser', avatar_url: '' },
          html_url: 'https://github.com/o/r/pull/5',
        }),
      });

      const pr = await client.createPR('owner/repo', {
        title: 'New PR',
        sourceBranch: 'feature',
        targetBranch: 'main',
        description: 'Description',
        draft: false,
      });

      expect(pr.title).toBe('New PR');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/pulls',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: 'New PR',
            head: 'feature',
            base: 'main',
            body: 'Description',
            draft: false,
          }),
        }),
      );
    });
  });

  describe('unapprovePR', () => {
    test('throws UserError as GitHub does not support it', async () => {
      expect(client.unapprovePR('owner/repo', 1)).rejects.toThrow(
        'GitHub does not support removing approvals. Create a new review with a different event.',
      );
    });
  });
});
