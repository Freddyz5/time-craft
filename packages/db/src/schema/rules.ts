// Rules: daily and weekly limits per child.
import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
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
