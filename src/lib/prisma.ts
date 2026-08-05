import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "../config/env";
import { logger } from "./logger";

const isSslEnabled =
  env.DATABASE_URL.includes("sslmode=require") ||
  env.DATABASE_URL.includes("sslmode=verify-full") ||
  env.NODE_ENV === "production";

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  ...(isSslEnabled ? { ssl: { rejectUnauthorized: false } } : {}),
});
const adapter = new PrismaPg(pool);


const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? ["query", "info", "warn", "error"]
        : ["error", "warn"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

logger.info("Prisma Client initialized with connection pooling");
