import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

import type { ReviewSession } from '../entity/Schemas';

import { SessionStore } from './SessionStore';

const TEST_SESSION_DIR = join(homedir(), '.config', 'gfreview', 'sessions');

describe('SessionStore', () => {
  const testSession: ReviewSession = {
    projectId: 'test-owner/test-repo',
    mrIid: 42,
    startedAt: '2024-01-01T00:00:00Z',
    versions: {
      headSha: 'abc123',
    },
    reviewId: 1,
    comments: [{ id: '1', file: 'test.ts', line: 10, side: 'new', body: 'Great code!' }],
  };

  beforeEach(async () => {
    try {
      await mkdir(TEST_SESSION_DIR, { recursive: true });
    } catch {
      // exists
    }
  });

  afterEach(async () => {
    try {
      await rm(TEST_SESSION_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('write and read session', async () => {
    await SessionStore.write('test-owner/test-repo', 42, testSession);

    const read = await SessionStore.read('test-owner/test-repo', 42);

    expect(read).toEqual(testSession);
  });

  test('read returns null for non-existent session', async () => {
    const read = await SessionStore.read('nonexistent/repo', 999);
    expect(read).toBeNull();
  });

  test('delete removes session', async () => {
    await SessionStore.write('test-owner/test-repo', 42, testSession);
    await SessionStore.delete('test-owner/test-repo', 42);

    const read = await SessionStore.read('test-owner/test-repo', 42);
    expect(read).toBeNull();
  });

  test('exists returns true for existing session', async () => {
    await SessionStore.write('test-owner/test-repo', 42, testSession);

    const exists = await SessionStore.exists('test-owner/test-repo', 42);
    expect(exists).toBe(true);
  });

  test('exists returns false for non-existent session', async () => {
    const exists = await SessionStore.exists('nonexistent/repo', 999);
    expect(exists).toBe(false);
  });

  test('can update existing session', async () => {
    await SessionStore.write('test-owner/test-repo', 42, testSession);

    const updatedSession: ReviewSession = {
      ...testSession,
      comments: [
        ...(testSession.comments ?? []),
        { id: '2', file: 'other.ts', line: 20, side: 'new', body: 'Another comment' },
      ],
    };

    await SessionStore.write('test-owner/test-repo', 42, updatedSession);

    const read = await SessionStore.read('test-owner/test-repo', 42);
    expect(read?.comments).toHaveLength(2);
  });

  test('handles different project IDs', async () => {
    const session1: ReviewSession = { ...testSession, projectId: 'owner1/repo1' };
    const session2: ReviewSession = { ...testSession, projectId: 'owner2/repo2', mrIid: 100 };

    await SessionStore.write('owner1/repo1', 42, session1);
    await SessionStore.write('owner2/repo2', 100, session2);

    const read1 = await SessionStore.read('owner1/repo1', 42);
    const read2 = await SessionStore.read('owner2/repo2', 100);

    expect(read1?.projectId).toBe('owner1/repo1');
    expect(read2?.projectId).toBe('owner2/repo2');
  });
});
