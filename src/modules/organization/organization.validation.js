import { z } from "zod";
import { Role } from "@prisma/client";
export const inviteMemberSchema = z.object({
    email: z.string().email("Valid email address is required"),
    role: z.nativeEnum(Role, {
        message: "Role must be ADMIN, ENGINEER, or VIEWER",
    }),
});
export const updateMemberRoleSchema = z.object({
    role: z.nativeEnum(Role, {
        message: "Role must be ADMIN, ENGINEER, or VIEWER",
    }),
});
