import type { ErrorRequestHandler } from 'express';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
  }
}
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}
export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 401, 'UNAUTHORIZED');
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}
export class ConversationEndedError extends AppError {
  constructor(message = 'This conversation has ended and can no longer receive messages') {
    super(message, 409, 'CONVERSATION_ENDED');
  }
}
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

/**
 * Formats an application error into the public API error envelope.
 * @param error Error forwarded by an Express route or middleware.
 * @param _req Unused request associated with the failure.
 * @param res Response used to send the normalized status and error body.
 * @param _next Unused callback because this is the terminal error handler.
 * @returns Nothing; the function sends the error response synchronously.
 */
export const errorMiddleware: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const known = error instanceof AppError;
  const statusCode = known ? error.statusCode : 500;
  const code = known ? error.code : 'INTERNAL_ERROR';
  const message =
    known || process.env['NODE_ENV'] !== 'production'
      ? error instanceof Error
        ? error.message
        : 'Unknown error'
      : 'Internal server error';
  if (process.env['NODE_ENV'] !== 'test') console.error(error);
  res.status(statusCode).json({ success: false, error: { code, message } });
};
