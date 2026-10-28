// Who: the household, its parents and children, and the activities that use
// up the quota.
import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	pgTable,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { authUser } from "./auth";

// Household: groups both parents and the child(ren).
export const families = pgTable(
	"families",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: varchar("name", { length: 100 }).notNull(),
		timezone: varchar("timezone", { length: 64 })
			.notNull()
			.default("America/Guayaquil"),
		// 0 = Sunday, 1 = Monday ... 6 = Saturday
		weekStartDay: smallint("week_start_day").notNull().default(1),
		// An unanswered child request expires after this many minutes.
		requestExpiryMinutes: integer("request_expiry_minutes")
			.notNull()
			.default(15),
		// If nobody stops a session, the server closes it this long after its end.
		autoCloseAfterMinutes: integer("auto_close_after_minutes")
			.notNull()
			.default(30),
		// Single-use recovery code (last resort if both parents lose access).
		recoveryCodeHash: text("recovery_code_hash"),
		// Using the code generates a new one.
		recoveryCodeCreatedAt: timestamp("recovery_code_created_at", {
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check("chk_families_week_start", sql`${t.weekStartDay} BETWEEN 0 AND 6`),
		check("chk_families_expiry", sql`${t.requestExpiryMinutes} > 0`),
		check("chk_families_auto_close", sql`${t.autoCloseAfterMinutes} > 0`),
	],
);

// Parents manage everything. Their login lives in auth_user.
export const parents = pgTable(
	"parents",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		familyId: uuid("family_id").notNull(),
		authUserId: text("auth_user_id").notNull(),
		name: varchar("name", { length: 100 }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("uq_parents_auth_user").on(t.authUserId),
		foreignKey({
			name: "fk_parents_family",
			columns: [t.familyId],
			foreignColumns: [families.id],
		}),
		foreignKey({
			name: "fk_parents_auth_user",
			columns: [t.authUserId],
			foreignColumns: [authUser.id],
		}),
		index("idx_parents_family").on(t.familyId),
	],
);

// Children sign in with username + PIN from any browser. A parent creates the
// account (there is no public sign-up). Lockout after failed attempts is
// enforced with Better Auth hooks, on top of the per-IP rate limit.
export const children = pgTable(
	"children",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		familyId: uuid("family_id").notNull(),
		authUserId: text("auth_user_id").notNull(),
		name: varchar("name", { length: 100 }).notNull(),
		avatar: varchar("avatar", { length: 60 }),
		failedPinAttempts: smallint("failed_pin_attempts").notNull().default(0),
		lockedUntil: timestamp("locked_until", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("uq_children_auth_user").on(t.authUserId),
		foreignKey({
			name: "fk_children_family",
			columns: [t.familyId],
			foreignColumns: [families.id],
		}),
		foreignKey({
			name: "fk_children_auth_user",
			columns: [t.authUserId],
			foreignColumns: [authUser.id],
		}),
		index("idx_children_family").on(t.familyId),
	],
);

// Activities that use up the quota (milestone 1: game and TV).
export const activities = pgTable(
	"activities",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		familyId: uuid("family_id").notNull(),
		// 'game', 'tv'
		code: varchar("code", { length: 30 }).notNull(),
		// 'Juego', 'TV'
		name: varchar("name", { length: 60 }).notNull(),
		isActive: boolean("is_active").notNull().default(true),
	},
	(t) => [
		unique("uq_activities_family_code").on(t.familyId, t.code),
		foreignKey({
			name: "fk_activities_family",
			columns: [t.familyId],
			foreignColumns: [families.id],
		}),
	],
);

export type Family = typeof families.$inferSelect;
export type NewFamily = typeof families.$inferInsert;
export type Parent = typeof parents.$inferSelect;
export type NewParent = typeof parents.$inferInsert;
export type Child = typeof children.$inferSelect;
export type NewChild = typeof children.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
