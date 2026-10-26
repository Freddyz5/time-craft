// A per-IP limit for the api's own sensitive routes (the recovery code),
// stored in auth_rate_limit like Better Auth's: memory is useless in
// serverless. Keys start with "api|", so they never collide with Better
// Auth's (ip|path). Here last_request holds when the current window started.
import { randomUUID } from "node:crypto";
import { authRateLimit, type Db } from "@time-craft/db";
import { sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { HttpError } from "./errors";

export interface RateLimitRule {
	windowSeconds: number;
	max: number;
}

export interface RateLimiter {
	// Counts one request; false once the key went over the rule's max.
	consume(key: string, rule: RateLimitRule): Promise<boolean>;
}

export class DatabaseRateLimiter implements RateLimiter {
	constructor(
		private readonly db: Db,
		private readonly now: () => number = Date.now,
	) {}

	async consume(key: string, rule: RateLimitRule): Promise<boolean> {
		const now = this.now();
		const windowStart = now - rule.windowSeconds * 1000;
		const expired = sql`${authRateLimit.lastRequest} < ${windowStart}`;
		// One atomic upsert: a new window starts at 1, otherwise count + 1.
		const [row] = await this.db
			.insert(authRateLimit)
			.values({ id: randomUUID(), key, count: 1, lastRequest: now })
			.onConflictDoUpdate({
				target: authRateLimit.key,
				set: {
					count: sql`case when ${expired} then 1 else ${authRateLimit.count} + 1 end`,
					lastRequest: sql`case when ${expired} then ${now} else ${authRateLimit.lastRequest} end`,
				},
			})
			.returning({ count: authRateLimit.count });
		return (row?.count ?? 1) <= rule.max;
	}
}

// Same headers as Better Auth (see src/auth); a single value only, since the
// leftmost entry of a longer chain can be forged.
export function clientIp(c: Context): string {
	for (const name of ["x-vercel-forwarded-for", "x-forwarded-for"]) {
		const value = c.req.header(name)?.trim();
		if (value !== undefined && value !== "" && !value.includes(",")) {
			return value;
		}
	}
	return "unknown";
}

export function rateLimit(
	limiter: RateLimiter,
	name: string,
	rule: RateLimitRule,
): MiddlewareHandler {
	return async (c, next) => {
		const allowed = await limiter.consume(`api|${name}|${clientIp(c)}`, rule);
		if (!allowed) {
			throw new HttpError(
				429,
				"rate_limited",
				"Too many attempts, try again later",
				{ retryAfterSeconds: rule.windowSeconds },
				{ "retry-after": String(rule.windowSeconds) },
			);
		}
		await next();
	};
}
