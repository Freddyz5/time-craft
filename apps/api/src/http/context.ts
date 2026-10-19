// What every route receives: the use cases, Better Auth, the clock (for
// serverTime) and, for the routes that need them, the QStash signature check
// and the rate limiter.
import type { Actor, Clock, Core } from "@time-craft/core";
import type { Context } from "hono";
import type { JobSignatureVerifier } from "../adapters/qstash";
import type { Auth } from "../auth";
import { HttpError } from "./errors";
import type { RateLimiter } from "./rate-limit";

export interface AppDeps {
	core: Core;
	auth: Auth;
	clock: Clock;
	jobSignatures: JobSignatureVerifier;
	rateLimiter: RateLimiter;
}

export interface AppEnv {
	Variables: {
		// Set by the session guard on every /api route except the public ones.
		actor: Actor;
	};
}

export function actorOf(c: Context<AppEnv>): Actor {
	const actor = c.get("actor");
	if (actor === undefined) {
		// A route reached without the guard: a wiring bug, not a client error.
		throw new Error(`No actor for ${c.req.method} ${c.req.path}`);
	}
	return actor;
}

// Resolves the Better Auth session to an Actor (parent or child), which is
// all core needs to know about who is calling.
export async function resolveActor(
	deps: Pick<AppDeps, "auth" | "core">,
	c: Context<AppEnv>,
): Promise<void> {
	const { headers, response: session } = await deps.auth.api.getSession({
		headers: c.req.raw.headers,
		returnHeaders: true,
	});
	// A session close to expiring is extended; pass the renewed cookie on.
	for (const cookie of headers.getSetCookie()) {
		c.header("set-cookie", cookie, { append: true });
	}
	if (session === null) {
		throw new HttpError(401, "unauthenticated", "Sign in first");
	}
	const actor = await deps.core.resolveActor({ authUserId: session.user.id });
	if (actor === null) {
		throw new HttpError(
			403,
			"no_role",
			"This login is neither a parent nor a child of a family",
		);
	}
	c.set("actor", actor);
}
