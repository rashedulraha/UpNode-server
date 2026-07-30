import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { logger } from "../lib/logger";
import { env } from "../config/env";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "APPLICATION_ERROR"
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message, "NOT_FOUND");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(403, message, "FORBIDDEN");
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(400, message, "BAD_REQUEST");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized access") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class OptimisticLockError extends AppError {
  constructor(
    message = "Conflict: The resource was modified by another request. Please reload and try again."
  ) {
    super(409, message, "OPTIMISTIC_LOCK_CONFLICT");
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const isDev = env.NODE_ENV === "development";

  // 1. Handle Custom Application Errors (AppError)
  if (err instanceof AppError) {
    logger.warn(`AppError [${err.code}]: ${err.message}`, {
      path: req.originalUrl,
      status: err.statusCode,
    });

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: {
        code: err.code,
      },
    });
    return;
  }

  // 2. Handle Zod Validation Errors
  if (err instanceof ZodError) {
    const issues = err.issues || (err as any).errors || [];
    logger.warn(`ValidationError on ${req.originalUrl}:`, issues);

    res.status(400).json({
      success: false,
      message: "Invalid input data provided.",
      error: {
        code: "VALIDATION_ERROR",
        details: issues.map((e: any) => ({
          field: Array.isArray(e.path) ? e.path.join(".") : e.path,
          message: e.message,
        })),
      },
    });
    return;
  }

  // 3. Handle Prisma Database Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error(`Prisma Error [${err.code}]: ${err.message}`, { code: err.code });

    if (err.code === "P2002") {
      res.status(409).json({
        success: false,
        message: "A record with this unique value already exists.",
        error: { code: "DUPLICATE_ENTRY" },
      });
      return;
    }

    if (err.code === "P2025") {
      res.status(404).json({
        success: false,
        message: "Target record not found in the database.",
        error: { code: "RECORD_NOT_FOUND" },
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: "Database operation failed.",
      error: { code: "DATABASE_ERROR" },
    });
    return;
  }

  // 4. Handle JSON Parsing Syntax Errors
  if (err instanceof SyntaxError && "status" in err && (err as any).status === 400) {
    res.status(400).json({
      success: false,
      message: "Malformed JSON payload provided.",
      error: { code: "INVALID_JSON" },
    });
    return;
  }

  // 5. Handle Unknown Server Errors (500)
  logger.error(`[Unhandled Internal Server Error] ${err.name}: ${err.message}`, {
    stack: isDev ? err.stack : undefined,
    url: req.originalUrl,
  });

  res.status(500).json({
    success: false,
    message: "An unexpected internal server error occurred.",
    error: {
      code: "INTERNAL_SERVER_ERROR",
      ...(isDev ? { details: err.message, stack: err.stack } : {}),
    },
  });
};
