export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class StaleReviewError extends Error {
  constructor(
    message: string,
    public readonly cachedSha: string,
    public readonly currentSha: string,
  ) {
    super(message);
    this.name = 'StaleReviewError';
  }
}

export const EXIT_CODES = {
  SUCCESS: 0,
  USER_ERROR: 1,
  API_ERROR: 2,
  STALE_REVIEW: 3,
} as const;
