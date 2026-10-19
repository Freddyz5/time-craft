// Expired rows in the auth tables are never deleted by Better Auth when it
// stores them in the database, and there is no cron (Vercel Hobby, and Neon
// should sleep). They are pruned after each successful sign-in instead.
import {
	authRateLimit,
	authSession,
	authVerification,
	type Db,
} from "@time-craft/db";
import { lt } from "drizzle-orm";

// Rate limit windows are at most minutes long; a day is plenty.
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export async function pruneAuthTables(db: Db, now: Date): Promise<void> {
	try {
		await db.delete(authSession).where(lt(authSession.expiresAt, now));
		await db
			.delete(authVerification)
			.where(lt(authVerification.expiresAt, now));
		await db
			.delete(authRateLimit)
			.where(
				lt(authRateLimit.lastRequest, now.getTime() - RATE_LIMIT_RETENTION_MS),
			);
	} catch (error) {
		// Housekeeping must never break a sign-in.
		console.error("Could not prune the auth tables", error);
	}
}
