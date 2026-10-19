// Better Auth hooks. The rules come from core (AuthGuard); these only connect
// them to Better Auth's endpoints:
// - /sign-in/username (the child): refused while the child is locked out;
//   afterwards a wrong PIN is counted and a right one clears the count.
// - /change-password: parents need the stricter password rule, and the child
//   cannot change the PIN.
// - Any successful sign-in prunes expired rows from the auth tables, which
//   nothing else cleans up (there is no cron).
import { type Core, type ErrorKind, isDomainError } from "@time-craft/core";
import type { Db } from "@time-craft/db";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
	isAPIError,
} from "better-auth/api";
import { pruneAuthTables } from "./prune";

// What the hooks ask core: the child's lockout and the password rules.
export type AuthGuard = Pick<
	Core,
	"assertChildCanSignIn" | "recordChildSignIn" | "assertCanChangeOwnPassword"
>;

// Better Auth requires an email; the child's login gets a synthetic one.
export const CHILD_EMAIL_DOMAIN = "hijos.timecraft.local";

const apiStatus = {
	validation: "BAD_REQUEST",
	unauthorized: "UNAUTHORIZED",
	forbidden: "FORBIDDEN",
	not_found: "NOT_FOUND",
	conflict: "CONFLICT",
	rule: "UNPROCESSABLE_ENTITY",
} as const satisfies Record<ErrorKind, string>;

// Domain errors keep their code, as in the rest of the api.
function toAPIError(error: unknown): unknown {
	if (!isDomainError(error)) {
		return error;
	}
	return new APIError(apiStatus[error.kind], {
		...error.details,
		code: error.code,
		message: error.message,
	});
}

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

function bodyString(ctx: HookContext, field: string): string | null {
	const value: unknown = ctx.body?.[field];
	return typeof value === "string" ? value : null;
}

// Same lookup as the username plugin, which lowercases the username.
async function userIdByUsername(ctx: HookContext): Promise<string | null> {
	const value = bodyString(ctx, "username");
	if (value === null) {
		return null;
	}
	const user = await ctx.context.adapter.findOne<{ id: string }>({
		model: "user",
		where: [{ field: "username", value: value.toLowerCase() }],
	});
	return user?.id ?? null;
}

async function afterChildSignIn(
	ctx: HookContext,
	guard: AuthGuard,
): Promise<Response | undefined> {
	const returned = ctx.context.returned;
	if (isAPIError(returned)) {
		// Only a wrong PIN counts, not a malformed request.
		if (returned.body?.code !== "INVALID_USERNAME_OR_PASSWORD") {
			return undefined;
		}
		const authUserId = await userIdByUsername(ctx);
		if (authUserId === null) {
			return undefined;
		}
		const { lockedUntil } = await guard.recordChildSignIn({
			authUserId,
			succeeded: false,
		});
		if (lockedUntil === null) {
			return undefined;
		}
		// The attempt that locks says so right away. An APIError thrown here
		// would keep the endpoint's 401; a Response keeps its own status.
		return Response.json(
			{
				code: "child_locked",
				message: "Too many wrong PINs",
				lockedUntil: lockedUntil.toISOString(),
			},
			{ status: 403 },
		);
	}
	const session = ctx.context.newSession;
	if (session !== null) {
		await guard.recordChildSignIn({
			authUserId: session.user.id,
			succeeded: true,
		});
	}
	return undefined;
}

export function createAuthHooks(guard: AuthGuard, db: Db) {
	return {
		before: createAuthMiddleware(async (ctx) => {
			try {
				if (ctx.path === "/sign-in/username") {
					const authUserId = await userIdByUsername(ctx);
					if (authUserId !== null) {
						await guard.assertChildCanSignIn({ authUserId });
					}
				} else if (ctx.path === "/change-password") {
					const session = await getSessionFromCtx(ctx);
					if (session !== null) {
						await guard.assertCanChangeOwnPassword({
							authUserId: session.user.id,
							newPassword: bodyString(ctx, "newPassword") ?? "",
						});
					}
				}
			} catch (error) {
				throw toAPIError(error);
			}
		}),
		after: createAuthMiddleware(async (ctx) => {
			const signedIn =
				ctx.context.newSession !== null &&
				(ctx.path.startsWith("/sign-in/") || ctx.path.startsWith("/callback/"));
			if (signedIn) {
				await pruneAuthTables(db, new Date());
			}
			try {
				if (ctx.path === "/sign-in/username") {
					return await afterChildSignIn(ctx, guard);
				}
			} catch (error) {
				throw toAPIError(error);
			}
			return undefined;
		}),
	};
}
