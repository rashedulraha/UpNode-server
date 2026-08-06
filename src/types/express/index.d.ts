import { UserRole, UserRole as Role } from "@prisma/client";
import { type User, type Session } from "better-auth";

declare global {
  namespace Express {
    interface Request {
      user?: (User & { role?: UserRole; isBlocked?: boolean }) | null;
      session?: Session | null;
      organizationId?: string;
      role?: UserRole;
    }
  }
}

export {};
