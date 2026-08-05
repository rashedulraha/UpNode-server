import pino from "pino";
import { env } from "../config/env";

const isProduction = env.NODE_ENV === "production";

export const pinoInstance = pino({
  level: isProduction ? "info" : "debug",
  transport: !isProduction
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "yyyy-mm-dd HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

class Logger {
  info(arg1, arg2) {
    if (typeof arg1 === "string") {
      if (arg2 !== undefined) {
        pinoInstance.info(arg2, arg1);
      } else {
        pinoInstance.info(arg1);
      }
    } else {
      pinoInstance.info(arg1, arg2);
    }
  }

  warn(arg1, arg2) {
    if (typeof arg1 === "string") {
      if (arg2 !== undefined) {
        pinoInstance.warn(arg2, arg1);
      } else {
        pinoInstance.warn(arg1);
      }
    } else {
      pinoInstance.warn(arg1, arg2);
    }
  }

  error(arg1, arg2) {
    if (typeof arg1 === "string") {
      if (arg2 !== undefined) {
        pinoInstance.error(arg2, arg1);
      } else {
        pinoInstance.error(arg1);
      }
    } else {
      pinoInstance.error(arg1, arg2);
    }
  }

  debug(arg1, arg2) {
    if (typeof arg1 === "string") {
      if (arg2 !== undefined) {
        pinoInstance.debug(arg2, arg1);
      } else {
        pinoInstance.debug(arg1);
      }
    } else {
      pinoInstance.debug(arg1, arg2);
    }
  }
}

export const logger = new Logger();
