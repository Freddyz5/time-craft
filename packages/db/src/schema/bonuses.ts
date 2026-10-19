// Bonuses: tasks that earn minutes and the child's reports of them.
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
import { children, families, parents } from "./family";

// Catalogue of tasks that earn minutes, defined by the parents.
export const bonusTasks = pgTable(
	"bonus_tasks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		familyId: uuid("family_id").notNull(),
		// 'Deberes', 'Leer 20 min', 'Práctica de robótica'
		name: varchar("name", { length: 80 }).notNull(),
		description: varchar("description", { length: 255 }),
		rewardMinutes: integer("reward_minutes").notNull(),
		// NULL = no limit on times (the weekly minutes cap still applies)
		maxPerWeek: smallint("max_per_week"),
		isActive: boolean("is_active").notNull().default(true),
		createdByParentId: uuid("created_by_parent_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check("chk_bonus_reward", sql`${t.rewardMinutes} > 0`),
		check("chk_bonus_max", sql`${t.maxPerWeek} IS NULL OR ${t.maxPerWeek} > 0`),
		foreignKey({
			name: "fk_bonus_family",
			columns: [t.familyId],
			foreignColumns: [families.id],
		}),
		foreignKey({
			name: "fk_bonus_created_by",
			columns: [t.createdByParentId],
			foreignColumns: [parents.id],
		}),
	],
);

// The child reports a task as done; a parent validates it. awarded_minutes is
// set on approval (a copy of reward_minutes, or adjusted).
export const taskReports = pgTable(
	"task_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		childId: uuid("child_id").notNull(),
		bonusTaskId: uuid("bonus_task_id").notNull(),
		// What the child writes.
		note: varchar("note", { length: 200 }),
		status: varchar("status", {
			length: 20,
			enum: ["pending", "approved", "rejected"],
		})
			.notNull()
			.default("pending"),
		awardedMinutes: integer("awarded_minutes"),
		reviewNote: varchar("review_note", { length: 200 }),
		reportedAt: timestamp("reported_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		reviewedByParentId: uuid("reviewed_by_parent_id"),
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
	},
	(t) => [
		check(
			"chk_reports_status",
			sql`${t.status} IN ('pending', 'approved', 'rejected')`,
		),
		check(
			"chk_reports_awarded",
			sql`(${t.status} = 'approved' AND ${t.awardedMinutes} > 0) OR (${t.status} <> 'approved' AND ${t.awardedMinutes} IS NULL)`,
		),
		check(
			"chk_reports_reviewer",
			sql`${t.status} = 'pending' OR ${t.reviewedByParentId} IS NOT NULL`,
		),
		foreignKey({
			name: "fk_reports_child",
			columns: [t.childId],
			foreignColumns: [children.id],
		}),
		foreignKey({
			name: "fk_reports_task",
			columns: [t.bonusTaskId],
			foreignColumns: [bonusTasks.id],
		}),
		foreignKey({
			name: "fk_reports_reviewed_by",
			columns: [t.reviewedByParentId],
			foreignColumns: [parents.id],
		}),
		index("idx_reports_child_reported").on(t.childId, t.reportedAt),
		index("idx_reports_status").on(t.status),
		// One pending report per child and task.
		uniqueIndex("uq_reports_one_pending")
			.on(t.childId, t.bonusTaskId)
			.where(sql`${t.status} = 'pending'`),
	],
);

export type BonusTask = typeof bonusTasks.$inferSelect;
export type NewBonusTask = typeof bonusTasks.$inferInsert;
export type TaskReport = typeof taskReports.$inferSelect;
export type NewTaskReport = typeof taskReports.$inferInsert;
