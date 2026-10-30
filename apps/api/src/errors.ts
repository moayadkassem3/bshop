export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string = code,
    /** Extra fields sent with the error, e.g. how long to wait before retrying. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = (message = 'Not allowed') => new AppError(403, 'FORBIDDEN', message);
export const badRequest = (code: string, message?: string) => new AppError(400, code, message);
export const conflict = (code: string, message?: string) => new AppError(409, code, message);
