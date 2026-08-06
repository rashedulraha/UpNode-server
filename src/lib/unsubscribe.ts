import crypto from "crypto";
import { env } from "../config/env";

const SECRET = env.BETTER_AUTH_SECRET || "unsubscribe_secret_fallback";

export function generateUnsubscribeToken(
	email: string,
	projectId: string,
): string {
	const normalizedEmail = email.toLowerCase().trim();
	return crypto
		.createHmac("sha256", SECRET)
		.update(`${projectId}:${normalizedEmail}`)
		.digest("hex");
}

export function verifyUnsubscribeToken(
	email: string,
	projectId: string,
	token: string,
): boolean {
	if (!email || !projectId || !token) return false;
	const expectedToken = generateUnsubscribeToken(email, projectId);
	const expectedBuffer = Buffer.from(expectedToken);
	const tokenBuffer = Buffer.from(token);

	if (expectedBuffer.length !== tokenBuffer.length) {
		return false;
	}

	return crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
}
