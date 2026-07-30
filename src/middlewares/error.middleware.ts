import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(403, message);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(400, message);
  }
}

export class OptimisticLockError extends AppError {
  constructor(message = "Conflict: The resource was modified by another request. Please reload and try again.") {
    super(409, message);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
    });
    return;
  }

  console.error(`[Unhandled Error] ${err.name}: ${err.message}`, err.stack);

  res.status(500).json({
    error: "InternalServerError",
    message: "An unexpected server error occurred.",
  });
};
