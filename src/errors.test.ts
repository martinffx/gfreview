import { test, expect, describe } from 'bun:test';

import { UserError, ApiError, StaleReviewError, EXIT_CODES } from './errors';

describe('UserError', () => {
  test('creates error with message', () => {
    const error = new UserError('Missing required field');
    expect(error.message).toBe('Missing required field');
    expect(error.name).toBe('UserError');
  });

  test('is instanceof Error', () => {
    const error = new UserError('test');
    expect(error instanceof Error).toBe(true);
  });
});

describe('ApiError', () => {
  test('creates error with message and status code', () => {
    const error = new ApiError('Not Found', 404);
    expect(error.message).toBe('Not Found');
    expect(error.statusCode).toBe(404);
    expect(error.name).toBe('ApiError');
  });

  test('includes body when provided', () => {
    const body = { message: 'Resource not found' };
    const error = new ApiError('Error', 404, body);
    expect(error.body).toEqual(body);
  });

  test('body is undefined when not provided', () => {
    const error = new ApiError('Error', 500);
    expect(error.body).toBeUndefined();
  });
});

describe('StaleReviewError', () => {
  test('creates error with message and SHAs', () => {
    const error = new StaleReviewError('PR has been updated', 'abc123', 'def456');
    expect(error.message).toBe('PR has been updated');
    expect(error.cachedSha).toBe('abc123');
    expect(error.currentSha).toBe('def456');
    expect(error.name).toBe('StaleReviewError');
  });
});

describe('EXIT_CODES', () => {
  test('has SUCCESS as 0', () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
  });

  test('has USER_ERROR as 1', () => {
    expect(EXIT_CODES.USER_ERROR).toBe(1);
  });

  test('has API_ERROR as 2', () => {
    expect(EXIT_CODES.API_ERROR).toBe(2);
  });

  test('has STALE_REVIEW as 3', () => {
    expect(EXIT_CODES.STALE_REVIEW).toBe(3);
  });
});
