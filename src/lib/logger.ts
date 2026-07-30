import { env } from "../config/env";

export type LogLevel = "info" | "warn" | "error" | "debug";

class Logger {
  private isProduction = env.NODE_ENV === "production";

  private formatMessage(level: LogLevel, message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    if (this.isProduction) {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...(meta ? { meta } : {}),
      });
    }

    const levelColor = {
      info: "\x1b[36m[INFO]\x1b[0m",
      warn: "\x1b[33m[WARN]\x1b[0m",
      error: "\x1b[31m[ERROR]\x1b[0m",
      debug: "\x1b[35m[DEBUG]\x1b[0m",
    }[level];

    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${levelColor} ${message}${metaStr}`;
  }

  info(message: string, meta?: any) {
    console.log(this.formatMessage("info", message, meta));
  }

  warn(message: string, meta?: any) {
    console.warn(this.formatMessage("warn", message, meta));
  }

  error(message: string, meta?: any) {
    console.error(this.formatMessage("error", message, meta));
  }

  debug(message: string, meta?: any) {
    if (!this.isProduction) {
      console.log(this.formatMessage("debug", message, meta));
    }
  }
}

export const logger = new Logger();
