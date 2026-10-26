// Better Auth tables, written by hand from docs/timecraft_v1.sql and checked
// against the Better Auth CLI output (apps/api/CLAUDE.md says how). The api
// maps each model to these export names with modelName; columns are
// snake_case, and timestamps keep the time zone like the rest of the schema.
import {
	bigint,
	boolean,
	foreignKey,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

// One row per person who signs in (parent or child). The domain table that
// references it (parents or children) says which one it is.
export const authUser = pgTable(
	"auth_user",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		// Child: synthetic address, username@hijos.timecraft.local
		email: text("email").notNull(),
		emailVerified: boolean("email_verified").notNull().default(false),
		image: text("image"),
		// username plugin, globally unique (child login)
		username: text("username"),
		displayUsername: text("display_username"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		unique("uq_auth_user_email").on(t.email),
		unique("uq_auth_user_username").on(t.username),
	],
);

// Login sessions. They double as the device registry: a parent can see where
// the child is signed in and revoke that session.
export const authSession = pgTable(
	"auth_session",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").notNull(),
		token: text("token").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		unique("uq_auth_session_token").on(t.token),
		foreignKey({
			name: "fk_auth_session_user",
			columns: [t.userId],
			foreignColumns: [authUser.id],
		}).onDelete("cascade"),
		index("idx_auth_session_user").on(t.userId),
	],
);

// Credentials. provider_id is 'credential' for email/username + password and
// 'google' for parents signing in with Google. password holds the hash (a
// parent's password or the child's PIN).
export const authAccount = pgTable(
	"auth_account",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").notNull(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		password: text("password"),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
			withTimezone: true,
		}),
		scope: text("scope"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		foreignKey({
			name: "fk_auth_account_user",
			columns: [t.userId],
			foreignColumns: [authUser.id],
		}).onDelete("cascade"),
		index("idx_auth_account_user").on(t.userId),
	],
);

// Short-lived values, such as the OAuth state of a Google sign-in. Better
// Auth looks them up by identifier.
export const authVerification = pgTable(
	"auth_verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [index("idx_auth_verification_identifier").on(t.identifier)],
);

// Database-backed rate limit (memory is useless in serverless). It does not
// clean itself up: old rows have to be deleted from time to time.
export const authRateLimit = pgTable(
	"auth_rate_limit",
	{
		id: text("id").primaryKey(),
		key: text("key").notNull(),
		count: integer("count").notNull(),
		lastRequest: bigint("last_request", { mode: "number" }).notNull(),
	},
	(t) => [unique("uq_auth_rate_limit_key").on(t.key)],
);

export type AuthUser = typeof authUser.$inferSelect;
export type NewAuthUser = typeof authUser.$inferInsert;
export type AuthSession = typeof authSession.$inferSelect;
export type NewAuthSession = typeof authSession.$inferInsert;
export type AuthAccount = typeof authAccount.$inferSelect;
export type NewAuthAccount = typeof authAccount.$inferInsert;
export type AuthVerification = typeof authVerification.$inferSelect;
export type NewAuthVerification = typeof authVerification.$inferInsert;
export type AuthRateLimit = typeof authRateLimit.$inferSelect;
export type NewAuthRateLimit = typeof authRateLimit.$inferInsert;
