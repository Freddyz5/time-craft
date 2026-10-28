// Better Auth: sessions and credentials for parents (Google or email +
// password) and the child (username + PIN). Mounted at /api/auth/*.
//
// Tables: the Drizzle adapter addresses the schema of packages/db by its
// export names, so each model's modelName is that name (authUser → table
// auth_user). Fields keep Better Auth's names: they are the Drizzle
// properties, which map to snake_case columns.
//
// There is no sign-up: parents come from the seed, and the child's login is
// created by a parent through the api (IdentityService). Whether someone is a
// parent or a child is decided by the domain tables, not here.
import {
	authAccount,
	authRateLimit,
	authSession,
	authUser,
	authVerification,
	type Db,
} from "@time-craft/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { type AuthGuard, CHILD_EMAIL_DOMAIN, createAuthHooks } from "./hooks";

export type { AuthGuard } from "./hooks";
export { CHILD_EMAIL_DOMAIN } from "./hooks";

export interface AuthOptions {
	db: Db;
	baseURL: string;
	// Origins besides baseURL's that may call it (patterns with `*`): the
	// web's preview URLs on Vercel.
	trustedOrigins?: string[] | undefined;
	secret: string;
	// Google sign-in is only offered when configured (dev and production).
	google?: { clientId: string; clientSecret: string } | undefined;
	guard: AuthGuard;
	// Per-IP rate limit, stored in auth_rate_limit. Off only in tests.
	rateLimit?: boolean;
	// Silences Better Auth's logger (tests).
	silent?: boolean;
}

// Endpoints Better Auth exposes that this app does not use: profile and
// email changes go through the domain tables, and there is no email in milestone 1.
const DISABLED_PATHS = [
	"/update-user",
	"/change-email",
	"/delete-user",
	"/request-password-reset",
	"/reset-password",
	"/send-verification-email",
	"/verify-email",
	"/is-username-available",
];

export function createAuth(options: AuthOptions) {
	const hooks = createAuthHooks(options.guard, options.db);
	return betterAuth({
		appName: "Time Craft",
		baseURL: options.baseURL,
		trustedOrigins: options.trustedOrigins,
		basePath: "/api/auth",
		secret: options.secret,
		database: drizzleAdapter(options.db, {
			provider: "pg",
			schema: {
				authUser,
				authSession,
				authAccount,
				authVerification,
				authRateLimit,
			},
		}),
		user: { modelName: "authUser" },
		session: { modelName: "authSession" },
		account: {
			modelName: "authAccount",
			accountLinking: {
				// A parent's first Google sign-in links Google to the user the
				// seed created. Those users were never verified by email, and
				// that is safe here: with sign-up disabled, nobody can create a
				// user with someone else's address.
				trustedProviders: ["google"],
				requireLocalEmailVerified: false,
			},
		},
		verification: { modelName: "authVerification" },
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			// The PIN floor. Parents get a stricter rule from core.
			minPasswordLength: 6,
			maxPasswordLength: 128,
		},
		socialProviders: options.google
			? {
					google: {
						clientId: options.google.clientId,
						clientSecret: options.google.clientSecret,
						// Only emails that already exist (the parents) get in.
						disableSignUp: true,
						prompt: "select_account",
					},
				}
			: {},
		plugins: [username()],
		rateLimit: {
			enabled: options.rateLimit ?? true,
			storage: "database",
			modelName: "authRateLimit",
			window: 60,
			max: 100,
			customRules: {
				"/sign-in/email": { window: 60, max: 5 },
				"/sign-in/username": { window: 60, max: 5 },
				"/sign-in/social": { window: 60, max: 10 },
				"/change-password": { window: 60, max: 5 },
			},
		},
		disabledPaths: DISABLED_PATHS,
		hooks,
		databaseHooks: {
			user: {
				create: {
					// Defense in depth for "no sign-up": the only users created at
					// runtime are children's logins.
					before: async (user) =>
						user.email.endsWith(`@${CHILD_EMAIL_DOMAIN}`) ? undefined : false,
				},
			},
		},
		advanced: {
			ipAddress: {
				// Vercel sets both; the first one cannot be forged by the client.
				ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"],
			},
		},
		logger: { disabled: options.silent ?? false },
		telemetry: { enabled: false },
	});
}

export type Auth = ReturnType<typeof createAuth>;
