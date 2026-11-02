// Rules: daily and weekly limits per child, and the rules the parents write.
import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	pgTable,
	smallint,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { activities, children, parents } from "./family";

// Daily and weekly limits, with history (valid_from / valid_to). Changing a
// limit closes the current policy and creates a new one.
// activity_id NULL = global quota (game and TV share the same pool).
export const quotaPolicies = pgTable(
	"quota_policies",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		childId: uuid("child_id").notNull(),
		activityId: uuid("activity_id"),
		dailyLimitMinutes: integer("daily_limit_minutes").notNull(),
		weeklyLimitMinutes: integer("weekly_limit_minutes").notNull(),
		// Cap on bonus minutes earned per week.
		weeklyBonusCapMinutes: integer("weekly_bonus_cap_minutes")
			.notNull()
			.default(60),
		// The excess is taken from the next day.
		carryOverExcess: boolean("carry_over_excess").notNull().default(false),
		// Advance warning before the end.
		warningMinutes: integer("warning_minutes").notNull().default(5),
		// Days of the week the quota can be used (0 = Sunday ... 6 = Saturday).
		// On any other day it gives nothing; a parent can still grant extra time.
		allowedDays: smallint("allowed_days")
			.array()
			.notNull()
			.default([0, 1, 2, 3, 4, 5, 6]),
		// Minutes after the end that never count, so there is time to stop it.
		graceMinutes: integer("grace_minutes").notNull().default(0),
		validFrom: timestamp("valid_from", { withTimezone: true })
			.notNull()
			.defaultNow(),
		// NULL = current
		validTo: timestamp("valid_to", { withTimezone: true }),
		createdByParentId: uuid("created_by_parent_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check(
			"chk_quota_limits",
			sql`${t.dailyLimitMinutes} > 0 AND ${t.weeklyLimitMinutes} >= ${t.dailyLimitMinutes}`,
		),
		check("chk_quota_bonus_cap", sql`${t.weeklyBonusCapMinutes} >= 0`),
		check("chk_quota_warning", sql`${t.warningMinutes} >= 0`),
		check(
			"chk_quota_allowed_days",
			sql`cardinality(${t.allowedDays}) BETWEEN 1 AND 7 AND ${t.allowedDays} <@ '{0,1,2,3,4,5,6}'::smallint[]`,
		),
		check("chk_quota_grace", sql`${t.graceMinutes} >= 0`),
		foreignKey({
			name: "fk_quota_child",
			columns: [t.childId],
			foreignColumns: [children.id],
		}),
		foreignKey({
			name: "fk_quota_activity",
			columns: [t.activityId],
			foreignColumns: [activities.id],
		}),
		foreignKey({
			name: "fk_quota_created_by",
			columns: [t.createdByParentId],
			foreignColumns: [parents.id],
		}),
		index("idx_quota_child").on(t.childId, t.validFrom),
		// One current policy per child and activity. COALESCE makes the global
		// policy (activity_id NULL) collide with itself too.
		uniqueIndex("uq_quota_current")
			.on(
				t.childId,
				sql`COALESCE(${t.activityId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
			)
			.where(sql`${t.validTo} IS NULL`),
	],
);

export type QuotaPolicy = typeof quotaPolicies.$inferSelect;
export type NewQuotaPolicy = typeof quotaPolicies.$inferInsert;

// Rules the parents write in their own words. For the child ("Primero los
// deberes"), read next to the automatic ones, or parents_only: a reminder
// for mom and dad ("Solo después de comer") the child never gets. The app
// enforces none of them. Ordered by position.
export const customRules = pgTable(
	"custom_rules",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		childId: uuid("child_id").notNull(),
		text: varchar("text", { length: 200 }).notNull(),
		parentsOnly: boolean("parents_only").notNull().default(false),
		position: integer("position").notNull(),
		createdByParentId: uuid("created_by_parent_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check("chk_custom_rules_text", sql`length(trim(${t.text})) > 0`),
		check("chk_custom_rules_position", sql`${t.position} >= 0`),
		foreignKey({
			name: "fk_custom_rules_child",
			columns: [t.childId],
			foreignColumns: [children.id],
		}),
		foreignKey({
			name: "fk_custom_rules_created_by",
			columns: [t.createdByParentId],
			foreignColumns: [parents.id],
		}),
		index("idx_custom_rules_child").on(t.childId, t.position),
	],
);

export type CustomRuleRow = typeof customRules.$inferSelect;
export type NewCustomRule = typeof customRules.$inferInsert;
