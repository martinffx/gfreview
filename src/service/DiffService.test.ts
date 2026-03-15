import { test, expect, describe } from 'bun:test';

import type { FileDiff } from '../entity/Schemas';

import { DiffService } from './DiffService';

describe('DiffService', () => {
  describe('formatFileDiff', () => {
    test('parses simple diff with additions and deletions', () => {
      const fileDiff: FileDiff = {
        old_path: 'test.ts',
        new_path: 'test.ts',
        diff: '@@ -1,3 +1,4 @@\n old line 1\n-old line 2\n+new line 2\n+new line 3\n old line 3',
        new_file: false,
        deleted_file: false,
        renamed_file: false,
      };

      const result = DiffService.formatFileDiff(fileDiff);

      expect(result.path).toBe('test.ts');
      expect(result.changeType).toBe('modified');
      expect(result.lines.length).toBeGreaterThanOrEqual(4);
    });

    test('marks new file as added', () => {
      const fileDiff: FileDiff = {
        old_path: '/dev/null',
        new_path: 'new-file.ts',
        diff: '@@ -0,0 +1,1 @@\n+new content',
        new_file: true,
        deleted_file: false,
        renamed_file: false,
      };

      const result = DiffService.formatFileDiff(fileDiff);

      expect(result.changeType).toBe('added');
    });

    test('marks deleted file as deleted', () => {
      const fileDiff: FileDiff = {
        old_path: 'deleted.ts',
        new_path: '/dev/null',
        diff: '@@ -1,0 +0,0 @@\n-deleted content',
        new_file: false,
        deleted_file: true,
        renamed_file: false,
      };

      const result = DiffService.formatFileDiff(fileDiff);

      expect(result.changeType).toBe('deleted');
    });

    test('marks renamed file correctly', () => {
      const fileDiff: FileDiff = {
        old_path: 'old-name.ts',
        new_path: 'new-name.ts',
        diff: '@@ -1,1 +1,1 @@\n unchanged',
        new_file: false,
        deleted_file: false,
        renamed_file: true,
      };

      const result = DiffService.formatFileDiff(fileDiff);

      expect(result.changeType).toBe('renamed');
    });

    test('assigns sequential display numbers', () => {
      const fileDiff: FileDiff = {
        old_path: 'test.ts',
        new_path: 'test.ts',
        diff: '@@ -1,2 +1,2 @@\n line 1\n line 2',
        new_file: false,
        deleted_file: false,
        renamed_file: false,
      };

      const result = DiffService.formatFileDiff(fileDiff);

      expect(result.lines[0]?.displayNumber).toBe(1);
      expect(result.lines[1]?.displayNumber).toBe(2);
    });
  });

  describe('getChangeIcon', () => {
    test('returns correct icons', () => {
      expect(DiffService.getChangeIcon('added')).toBe('A');
      expect(DiffService.getChangeIcon('deleted')).toBe('D');
      expect(DiffService.getChangeIcon('renamed')).toBe('R');
      expect(DiffService.getChangeIcon('modified')).toBe('M');
    });
  });

  describe('getLinePrefix', () => {
    test('returns correct prefixes', () => {
      expect(DiffService.getLinePrefix('addition')).toBe('+');
      expect(DiffService.getLinePrefix('deletion')).toBe('-');
      expect(DiffService.getLinePrefix('context')).toBe(' ');
    });
  });
});
