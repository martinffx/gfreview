import { test, expect, describe, mock } from 'bun:test';

import type { ForgeClient } from '../client/ForgeClient';
import type { DiffVersion } from '../entity/Schemas';

const mockGetVersions = mock<() => Promise<DiffVersion>>();
const mockDiscardReview = mock<() => Promise<void>>();

const mockClient = {
  forge: 'github' as const,
  getVersions: mockGetVersions,
  discardReview: mockDiscardReview,
} as unknown as ForgeClient;

describe('ReviewService', () => {
  test('placeholder - service tests need SessionStore mocking', () => {
    expect(true).toBe(true);
  });
});
