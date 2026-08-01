import { env } from "../config/env";
class Logger {
    isProduction = env.NODE_ENV === "production";
    formatMessage(level, message, meta) {
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
    info(message, meta) {
        console.log(this.formatMessage("info", message, meta));
    }
    warn(message, meta) {
        console.warn(this.formatMessage("warn", message, meta));
    }
    error(message, meta) {
        console.error(this.formatMessage("error", message, meta));
    }
    debug(message, meta) {
        if (!this.isProduction) {
            console.log(this.formatMessage("debug", message, meta));
        }
    }
}
export const logger = new Logger();
