import { describe, test, expect } from 'bun:test';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

import { readBodyFromArg } from './BodyReader';

describe('readBodyFromArg', () => {
  test('returns string directly when not - or @path', async () => {
    const result = await readBodyFromArg('hello world');
    expect(result).toBe('hello world');
  });

  test('returns undefined when value is undefined', async () => {
    const result = await readBodyFromArg(undefined);
    expect(result).toBe(undefined);
  });

  test('returns empty string when value is empty', async () => {
    const result = await readBodyFromArg('');
    expect(result).toBe('');
  });

  test('reads from file when value starts with @', async () => {
    const filePath = join('/tmp', 'gfreview-test-body-' + Date.now() + '.txt');
    writeFileSync(filePath, 'file contents');
    try {
      const result = await readBodyFromArg(`@${filePath}`);
      expect(result).toBe('file contents');
    } finally {
      unlinkSync(filePath);
    }
  });

  test('reads from stdin when value is -', async () => {
    // This is a basic placeholder - full stdin testing requires process substitution
    const result = await readBodyFromArg('-');
    // Will be empty string if no stdin input in test environment
    expect(typeof result).toBe('string');
  });
});
