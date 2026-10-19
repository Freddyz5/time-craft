// Child requests and the overrides a parent grants from them.
import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { activities, children, parents } from "./family";

// What the child asks for and a parent resolves from their phone:
//   start      = "I want to start" (activity + minutes)
//   extra_time = "I want extra time" (reason required, only with the quota used up)
// Approving creates the session (and the override for extra_time) in the same
// transaction; those rows point back here with request_id.
// Lazy expiry: a pending row whose expires_at has passed is marked 'expired'
// when read or before creating another one (otherwise the one-pending-per-child
// index blocks the new one).
export const childRequests = pgTable(
	"child_requests",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		childId: uuid("child_id").notNull(),
		requestType: varchar("request_type", {
			length: 20,
			enum: ["start", "extra_time"],
		}).notNull(),
		activityId: uuid("activity_id").notNull(),
		requestedMinutes: integer("requested_minutes").notNull(),
		// Required for extra_time.
		reason: text("reason"),
		status: varchar("status", {
			length: 20,
			enum: ["pending", "approved", "rejected", "expired", "cancelled"],
		})
			.notNull()
			.default("pending"),
		// A parent may approve fewer minutes than requested.
		approvedMinutes: integer("approved_minutes"),
		// e.g. "después de la cena"
		responseNote: varchar("response_note", { length: 200 }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		// created_at + families.request_expiry_minutes
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		resolvedByParentId: uuid("resolved_by_parent_id"),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
	},
	(t) => [
		check(
			"chk_requests_type",
			sql`${t.requestType} IN ('start', 'extra_time')`,
		),
		check(
			"chk_requests_status",
			sql`${t.status} IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')`,
		),
		check("chk_requests_minutes", sql`${t.requestedMinutes} > 0`),
		check(
			"chk_requests_reason",
			sql`${t.requestType} <> 'extra_time' OR length(trim(coalesce(${t.reason}, ''))) > 0`,
		),
		check(
			"chk_requests_approved",
			sql`(${t.status} = 'approved' AND ${t.approvedMinutes} > 0) OR (${t.status} <> 'approved' AND ${t.approvedMinutes} IS NULL)`,
		),
		check(
			"chk_requests_resolver",
			sql`${t.status} NOT IN ('approved', 'rejected') OR ${t.resolvedByParentId} IS NOT NULL`,
		),
		foreignKey({
			name: "fk_requests_child",
			columns: [t.childId],
			foreignColumns: [children.id],
		}),
		foreignKey({
			name: "fk_requests_activity",
			columns: [t.activityId],
			foreignColumns: [activities.id],
		}),
		foreignKey({
			name: "fk_requests_resolved_by",
			columns: [t.resolvedByParentId],
			foreignColumns: [parents.id],
		}),
		index("idx_requests_child_status").on(t.childId, t.status),
		// One pending request per child (so they cannot ask ten times).
		uniqueIndex("uq_requests_one_pending")
			.on(t.childId)
			.where(sql`${t.status} = 'pending'`),
	],
);

// Override: extra time a parent grants once the quota is used up. It comes
// from a child's extra_time request or straight from a parent (request_id
// NULL). It is always used in a new session (it does not extend a running one).
export const quotaOverrides = pgTable(
	"quota_overrides",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		childId: uuid("child_id").notNull(),
		requestId: uuid("request_id"),
		grantedByParentId: uuid("granted_by_parent_id").notNull(),
		extraMinutes: integer("extra_minutes").notNull(),
		reason: text("reason").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("uq_override_request").on(t.requestId),
		check("chk_override_minutes", sql`${t.extraMinutes} > 0`),
		check("chk_override_reason", sql`length(trim(${t.reason})) > 0`),
		foreignKey({
			name: "fk_override_child",
			columns: [t.childId],
			foreignColumns: [children.id],
		}),
		foreignKey({
			name: "fk_override_request",
			columns: [t.requestId],
			foreignColumns: [childRequests.id],
		}),
		foreignKey({
			name: "fk_override_granted_by",
			columns: [t.grantedByParentId],
			foreignColumns: [parents.id],
		}),
		index("idx_overrides_child").on(t.childId, t.createdAt),
	],
);

export type ChildRequest = typeof childRequests.$inferSelect;
export type NewChildRequest = typeof childRequests.$inferInsert;
export type QuotaOverride = typeof quotaOverrides.$inferSelect;
export type NewQuotaOverride = typeof quotaOverrides.$inferInsert;
