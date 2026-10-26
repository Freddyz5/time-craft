// Accounts: who is signed in and their household, the child's login (create
// it, reset the PIN, see and close its devices), a parent resetting the
// other parent's password, and the family's recovery code.
// Signing in, out and changing one's own password are Better Auth's
// (/api/auth/*).
import { Hono } from "hono";
import * as z from "zod";
import { type AppDeps, type AppEnv, actorOf } from "../http/context";
import { rateLimit } from "../http/rate-limit";
import { childParam, id, validate } from "../http/validation";

const createChildBody = z.object({
	name: z.string(),
	// Unique across the app. The child signs in with it and the PIN.
	username: z.string(),
	pin: z.string(),
	avatar: z.string().optional(),
});

const pinBody = z.object({ pin: z.string() });

const passwordBody = z.object({ newPassword: z.string() });

const loginParam = childParam.extend({ loginId: z.string().min(1) });

const useRecoveryCodeBody = z.object({
	email: z.string(),
	code: z.string(),
	newPassword: z.string(),
});

// Strict: the code is the last resort when both parents lost access.
const RECOVERY_RATE_LIMIT = { windowSeconds: 60 * 60, max: 5 };

export function accountRoutes({ core }: AppDeps) {
	return (
		new Hono<AppEnv>()
			.get("/me", async (c) => {
				const household = await core.getHousehold(actorOf(c));
				return c.json(household, 200);
			})
			.post("/children", validate("json", createChildBody), async (c) => {
				const child = await core.createChildAccount(
					actorOf(c),
					c.req.valid("json"),
				);
				return c.json({ child }, 201);
			})
			.put(
				"/children/:childId/pin",
				validate("param", childParam),
				validate("json", pinBody),
				async (c) => {
					await core.resetPassword(actorOf(c), {
						target: { kind: "child", ...c.req.valid("param") },
						newPassword: c.req.valid("json").pin,
					});
					return c.body(null, 204);
				},
			)
			.put(
				"/parents/:parentId/password",
				validate("param", z.object({ parentId: id })),
				validate("json", passwordBody),
				async (c) => {
					await core.resetPassword(actorOf(c), {
						target: { kind: "parent", ...c.req.valid("param") },
						newPassword: c.req.valid("json").newPassword,
					});
					return c.body(null, 204);
				},
			)
			.get(
				"/children/:childId/logins",
				validate("param", childParam),
				async (c) => {
					const logins = await core.listChildLogins(
						actorOf(c),
						c.req.valid("param"),
					);
					return c.json({ logins }, 200);
				},
			)
			.delete(
				"/children/:childId/logins",
				validate("param", childParam),
				async (c) => {
					const result = await core.revokeChildLogins(
						actorOf(c),
						c.req.valid("param"),
					);
					return c.json(result, 200);
				},
			)
			.delete(
				"/children/:childId/logins/:loginId",
				validate("param", loginParam),
				async (c) => {
					const result = await core.revokeChildLogins(
						actorOf(c),
						c.req.valid("param"),
					);
					return c.json(result, 200);
				},
			)
			// A new code replaces the old one. Shown once; only its hash is kept.
			.post("/recovery-code", async (c) => {
				const result = await core.regenerateRecoveryCode(actorOf(c));
				return c.json(result, 201);
			})
	);
}

// Public: whoever lost access has no session.
export function recoveryRoutes({ core, rateLimiter }: AppDeps) {
	return new Hono<AppEnv>().post(
		"/recovery-code/use",
		rateLimit(rateLimiter, "recovery-code", RECOVERY_RATE_LIMIT),
		validate("json", useRecoveryCodeBody),
		async (c) => {
			// Resets the parent's password and returns the family's new code.
			const result = await core.useRecoveryCode(c.req.valid("json"));
			return c.json(result, 200);
		},
	);
}
