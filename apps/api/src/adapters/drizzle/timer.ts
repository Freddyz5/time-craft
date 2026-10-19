// Timer: sessions with their pauses, and the jobs scheduled for them.
import type {
	Session,
	SessionAlertRepository,
	SessionRepository,
} from "@time-craft/core";
import {
	type Db,
	sessionAlerts,
	sessionPauses,
	sessions,
} from "@time-craft/db";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { within } from "./period";

// Where a session starts: started_at, or scheduled_start_at if it never did
// (the schema guarantees one of them).
const sessionStart = sql<Date>`coalesce(${sessions.startedAt}, ${sessions.scheduledStartAt})`;

// Sessions always come with their pauses, in order.
async function findSessions(
	db: Db,
	where: SQL | undefined,
	orderBy: SQL[] = [],
): Promise<Session[]> {
	return db.query.sessions.findMany({
		where,
		orderBy,
		with: { pauses: { orderBy: [asc(sessionPauses.pausedAt)] } },
	});
}

async function findSession(
	db: Db,
	where: SQL | undefined,
): Promise<Session | null> {
	const row = await db.query.sessions.findFirst({
		where,
		with: { pauses: { orderBy: [asc(sessionPauses.pausedAt)] } },
	});
	return row ?? null;
}

export function sessionRepository(db: Db): SessionRepository {
	return {
		findById: (id) => findSession(db, eq(sessions.id, id)),
		findOpenByChild: (childId) =>
			findSession(
				db,
				and(
					eq(sessions.childId, childId),
					inArray(sessions.status, ["scheduled", "running", "paused"]),
				),
			),
		listStartedOverlapping: (childId, period) =>
			findSessions(
				db,
				and(
					eq(sessions.childId, childId),
					isNotNull(sessions.startedAt),
					lt(sessions.startedAt, period.end),
					or(isNull(sessions.endedAt), gt(sessions.endedAt, period.start)),
				),
			),
		listByChildStartingIn: (childId, period) =>
			findSessions(
				db,
				and(eq(sessions.childId, childId), within(sessionStart, period)),
				[desc(sessionStart)],
			),
		async insert(session) {
			const { pauses, ...row } = session;
			await db.insert(sessions).values(row);
			if (pauses.length > 0) {
				await db.insert(sessionPauses).values(pauses);
			}
		},
		async update(session, expected) {
			const { pauses, ...row } = session;
			const updated = await db
				.update(sessions)
				.set(row)
				.where(and(eq(sessions.id, session.id), eq(sessions.status, expected)))
				.returning({ id: sessions.id });
			if (updated.length === 0) {
				return false;
			}
			if (pauses.length > 0) {
				// Pauses only ever get closed or added.
				await db
					.insert(sessionPauses)
					.values(pauses)
					.onConflictDoUpdate({
						target: sessionPauses.id,
						set: {
							resumedAt: sql`excluded.resumed_at`,
							resumedByParentId: sql`excluded.resumed_by_parent_id`,
						},
					});
			}
			return true;
		},
	};
}

const pending = and(
	isNull(sessionAlerts.sentAt),
	isNull(sessionAlerts.cancelledAt),
);

export function sessionAlertRepository(db: Db): SessionAlertRepository {
	return {
		async findById(id) {
			const [row] = await db
				.select()
				.from(sessionAlerts)
				.where(eq(sessionAlerts.id, id));
			return row ?? null;
		},
		async listPendingBySession(sessionId) {
			return db
				.select()
				.from(sessionAlerts)
				.where(and(eq(sessionAlerts.sessionId, sessionId), pending))
				.orderBy(asc(sessionAlerts.scheduledAt));
		},
		async insert(alert) {
			await db.insert(sessionAlerts).values(alert);
		},
		async markSentIfPending(id, at) {
			const updated = await db
				.update(sessionAlerts)
				.set({ sentAt: at })
				.where(and(eq(sessionAlerts.id, id), pending))
				.returning({ id: sessionAlerts.id });
			return updated.length > 0;
		},
		async markCancelled(ids, at) {
			if (ids.length === 0) {
				return;
			}
			await db
				.update(sessionAlerts)
				.set({ cancelledAt: at })
				.where(and(inArray(sessionAlerts.id, [...ids]), pending));
		},
	};
}
