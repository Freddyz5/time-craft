// Timer: screen sessions, their pauses and the QStash jobs scheduled for them.
import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	pgTable,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { activities, children, parents } from "./family";
import { childRequests, quotaOverrides } from "./requests";

// Screen session. Always created by a parent: directly or by approving a
// child request (request_id). The child watches it live, read-only.
// Two ways to start:
//   now   -> status 'running', started_at = now()
//   later -> status 'scheduled', scheduled_start_at = chosen time (at most
//            until the end of the day). QStash moves it to 'running' at that
//            time; a parent can start it early or cancel it ('cancelled').
//            On start, the duration is trimmed to what is available then; if
//            that is 0, it is cancelled.
// States: scheduled -> running <-> paused -> finished
//         scheduled -> cancelled
//   completed     = a parent stopped it at or after the end
//   stopped_early = a parent stopped it before the end
//   auto_closed   = nobody stopped it; the server closed it at
//                   end + families.auto_close_after_minutes
//                   (consumed_seconds = planned + that margin)
export const sessions = pgTable(
	"sessions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		childId: uuid("child_id").notNull(),
		activityId: uuid("activity_id").notNull(),
		// Set when it comes from a child request.
		requestId: uuid("request_id"),
		// Set when it was started with an override.
		overrideId: uuid("override_id"),
		status: varchar("status", {
			length: 20,
			enum: ["scheduled", "running", "paused", "finished", "cancelled"],
		}).notNull(),
		// Only when it was scheduled for later.
		scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
		// NULL while scheduled, or if it was cancelled before starting.
		startedAt: timestamp("started_at", { withTimezone: true }),
		// Proposal = available (+ override), never more.
		plannedDurationSeconds: integer("planned_duration_seconds").notNull(),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		endReason: varchar("end_reason", {
			length: 20,
			enum: ["completed", "stopped_early", "auto_closed"],
		}),
		// Actual time (excess included), set on close.
		consumedSeconds: integer("consumed_seconds"),
		startedByParentId: uuid("started_by_parent_id").notNull(),
		// Who stopped or cancelled it; NULL only if auto_closed.
		endedByParentId: uuid("ended_by_parent_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("uq_sessions_request").on(t.requestId),
		check(
			"chk_sessions_status",
			sql`${t.status} IN ('scheduled', 'running', 'paused', 'finished', 'cancelled')`,
		),
		check(
			"chk_sessions_end_reason",
			sql`${t.endReason} IS NULL OR ${t.endReason} IN ('completed', 'stopped_early', 'auto_closed')`,
		),
		check("chk_sessions_planned", sql`${t.plannedDurationSeconds} > 0`),
		check(
			"chk_sessions_start",
			sql`(${t.status} = 'scheduled' AND ${t.scheduledStartAt} IS NOT NULL AND ${t.startedAt} IS NULL)
			OR (${t.status} IN ('running', 'paused', 'finished') AND ${t.startedAt} IS NOT NULL)
			OR (${t.status} = 'cancelled' AND ${t.startedAt} IS NULL AND ${t.scheduledStartAt} IS NOT NULL)`,
		),
		check(
			"chk_sessions_end",
			sql`(${t.status} = 'finished' AND ${t.endedAt} IS NOT NULL AND ${t.endReason} IS NOT NULL AND ${t.consumedSeconds} IS NOT NULL)
			OR (${t.status} = 'cancelled' AND ${t.endedAt} IS NOT NULL AND ${t.endedByParentId} IS NOT NULL AND ${t.endReason} IS NULL AND ${t.consumedSeconds} IS NULL)
			OR (${t.status} IN ('scheduled', 'running', 'paused') AND ${t.endedAt} IS NULL AND ${t.endReason} IS NULL AND ${t.consumedSeconds} IS NULL)`,
		),
		check(
			"chk_sessions_ender",
			sql`${t.endReason} IS NULL OR ${t.endReason} = 'auto_closed' OR ${t.endedByParentId} IS NOT NULL`,
		),
		foreignKey({
			name: "fk_sessions_child",
			columns: [t.childId],
			foreignColumns: [children.id],
		}),
		foreignKey({
			name: "fk_sessions_activity",
			columns: [t.activityId],
			foreignColumns: [activities.id],
		}),
		foreignKey({
			name: "fk_sessions_request",
			columns: [t.requestId],
			foreignColumns: [childRequests.id],
		}),
		foreignKey({
			name: "fk_sessions_override",
			columns: [t.overrideId],
			foreignColumns: [quotaOverrides.id],
		}),
		foreignKey({
			name: "fk_sessions_started_by",
			columns: [t.startedByParentId],
			foreignColumns: [parents.id],
		}),
		foreignKey({
			name: "fk_sessions_ended_by",
			columns: [t.endedByParentId],
			foreignColumns: [parents.id],
		}),
		index("idx_sessions_child_started").on(t.childId, t.startedAt),
		index("idx_sessions_status").on(t.status),
		// One scheduled or active session per child at a time.
		uniqueIndex("uq_sessions_one_active")
			.on(t.childId)
			.where(sql`${t.status} IN ('scheduled', 'running', 'paused')`),
	],
);

// Pauses (e.g. a meal) do not use up quota. Only a parent can pause.
export const sessionPauses = pgTable(
	"session_pauses",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		sessionId: uuid("session_id").notNull(),
		pausedAt: timestamp("paused_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		// NULL = pause in progress
		resumedAt: timestamp("resumed_at", { withTimezone: true }),
		pausedByParentId: uuid("paused_by_parent_id").notNull(),
		resumedByParentId: uuid("resumed_by_parent_id"),
		reason: varchar("reason", { length: 120 }),
	},
	(t) => [
		check(
			"chk_pauses_order",
			sql`${t.resumedAt} IS NULL OR ${t.resumedAt} >= ${t.pausedAt}`,
		),
		foreignKey({
			name: "fk_pauses_session",
			columns: [t.sessionId],
			foreignColumns: [sessions.id],
		}).onDelete("cascade"),
		foreignKey({
			name: "fk_pauses_paused_by",
			columns: [t.pausedByParentId],
			foreignColumns: [parents.id],
		}),
		foreignKey({
			name: "fk_pauses_resumed_by",
			columns: [t.resumedByParentId],
			foreignColumns: [parents.id],
		}),
		index("idx_pauses_session").on(t.sessionId),
		// One pause in progress per session.
		uniqueIndex("uq_pauses_one_open")
			.on(t.sessionId)
			.where(sql`${t.resumedAt} IS NULL`),
	],
);

// Jobs scheduled with QStash (message with notBefore).
//   start      = starts a scheduled session and tells the child "¡ya puedes empezar!"
//   warning    = advance-warning push to parents and child
//   end        = end push to parents and child
//   auto_close = the server closes the session and tells the parents
// Starting a scheduled session early or cancelling it cancels its 'start'.
// Pausing cancels them in QStash (by provider_message_id) and sets
// cancelled_at; resuming inserts new rows with the recalculated time.
// The QStash endpoint is idempotent: it verifies the signature and does
// nothing if sent_at or cancelled_at is already set, or if the session is not
// in the expected state (QStash retries).
export const sessionAlerts = pgTable(
	"session_alerts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		sessionId: uuid("session_id").notNull(),
		alertType: varchar("alert_type", {
			length: 20,
			enum: ["start", "warning", "end", "auto_close"],
		}).notNull(),
		scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
		// QStash message id, used to cancel it.
		providerMessageId: varchar("provider_message_id", { length: 100 }),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
	},
	(t) => [
		check(
			"chk_alerts_type",
			sql`${t.alertType} IN ('start', 'warning', 'end', 'auto_close')`,
		),
		check(
			"chk_alerts_final",
			sql`${t.sentAt} IS NULL OR ${t.cancelledAt} IS NULL`,
		),
		foreignKey({
			name: "fk_alerts_session",
			columns: [t.sessionId],
			foreignColumns: [sessions.id],
		}).onDelete("cascade"),
		index("idx_alerts_session").on(t.sessionId),
	],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SessionPause = typeof sessionPauses.$inferSelect;
export type NewSessionPause = typeof sessionPauses.$inferInsert;
export type SessionAlert = typeof sessionAlerts.$inferSelect;
export type NewSessionAlert = typeof sessionAlerts.$inferInsert;
