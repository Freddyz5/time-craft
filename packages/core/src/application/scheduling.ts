// Creating sessions and keeping their jobs in step with their state.
import {
	type AlertPlan,
	type AlertType,
	planRunningAlerts,
	type SessionAlert,
} from "../domain/alerts";
import { dayPeriod } from "../domain/calendar";
import type { Family } from "../domain/family";
import {
	createRunningSession,
	createScheduledSession,
	type Session,
} from "../domain/session";
import { DomainError } from "../errors";
import type { Tx } from "./context";
import { calendarOf } from "./quota";

// `startAt` undefined means now. A later start is allowed until the end of
// the family's day.
export function resolveStartAt(
	startAt: Date | undefined,
	now: Date,
	family: Family,
): Date | null {
	if (startAt === undefined) {
		return null;
	}
	if (startAt.getTime() <= now.getTime()) {
		throw new DomainError(
			"invalid_start_time",
			"The start time must be in the future",
			{ startAt: startAt.toISOString() },
		);
	}
	const today = dayPeriod(now, calendarOf(family));
	if (startAt.getTime() >= today.end.getTime()) {
		throw new DomainError(
			"invalid_start_time",
			"The start time must be before the end of the day",
			{ startAt: startAt.toISOString(), latest: today.end.toISOString() },
		);
	}
	return startAt;
}

// Only one scheduled, running or paused session per child.
export async function assertNoOpenSession(
	tx: Tx,
	childId: string,
): Promise<void> {
	const open = await tx.repos.sessions.findOpenByChild(childId);
	if (open !== null) {
		throw new DomainError(
			"session_already_open",
			"The child already has a scheduled, running or paused session",
			{ sessionId: open.id, status: open.status },
		);
	}
}

export async function scheduleAlerts(
	tx: Tx,
	sessionId: string,
	plans: readonly AlertPlan[],
): Promise<SessionAlert[]> {
	const alerts: SessionAlert[] = [];
	for (const plan of plans) {
		const id = tx.deps.ids.next();
		const providerMessageId = await tx.deps.jobs.schedule({
			alertId: id,
			alertType: plan.type,
			runAt: plan.at,
		});
		const alert: SessionAlert = {
			id,
			sessionId,
			alertType: plan.type,
			scheduledAt: plan.at,
			providerMessageId,
			sentAt: null,
			cancelledAt: null,
		};
		await tx.repos.alerts.insert(alert);
		alerts.push(alert);
	}
	return alerts;
}

export async function scheduleRunningAlerts(
	tx: Tx,
	session: Session,
	settings: { warningMinutes: number; autoCloseAfterMinutes: number },
): Promise<SessionAlert[]> {
	return scheduleAlerts(
		tx,
		session.id,
		planRunningAlerts(session, tx.now, settings),
	);
}

export async function cancelPendingAlerts(
	tx: Tx,
	sessionId: string,
	types: readonly AlertType[],
): Promise<void> {
	const pending = (
		await tx.repos.alerts.listPendingBySession(sessionId)
	).filter((alert) => types.includes(alert.alertType));
	if (pending.length === 0) {
		return;
	}
	await tx.repos.alerts.markCancelled(
		pending.map((alert) => alert.id),
		tx.now,
	);
	for (const alert of pending) {
		if (alert.providerMessageId !== null) {
			tx.after.cancelJob(alert.providerMessageId);
		}
	}
}

export interface OpenSessionInput {
	family: Family;
	childId: string;
	activityId: string;
	requestId: string | null;
	overrideId: string | null;
	plannedSeconds: number;
	// null: start now.
	scheduledStartAt: Date | null;
	parentId: string;
	warningMinutes: number;
}

// Creates the session (running now, or scheduled) and its jobs. The caller
// has already checked the duration against the available time.
export async function openSession(
	tx: Tx,
	input: OpenSessionInput,
): Promise<Session> {
	await assertNoOpenSession(tx, input.childId);
	const base = {
		id: tx.deps.ids.next(),
		childId: input.childId,
		activityId: input.activityId,
		requestId: input.requestId,
		overrideId: input.overrideId,
		plannedDurationSeconds: input.plannedSeconds,
		startedByParentId: input.parentId,
		now: tx.now,
	};
	if (input.scheduledStartAt === null) {
		const session = createRunningSession(base);
		await tx.repos.sessions.insert(session);
		await scheduleRunningAlerts(tx, session, {
			warningMinutes: input.warningMinutes,
			autoCloseAfterMinutes: input.family.autoCloseAfterMinutes,
		});
		return session;
	}
	const session = createScheduledSession({
		...base,
		scheduledStartAt: input.scheduledStartAt,
	});
	await tx.repos.sessions.insert(session);
	await scheduleAlerts(tx, session.id, [
		{ type: "start", at: input.scheduledStartAt },
	]);
	return session;
}

// Writes a transition; another parent (or a job) may have changed the session
// in between.
export async function saveTransition(
	tx: Tx,
	session: Session,
	expected: Session["status"],
): Promise<void> {
	const saved = await tx.repos.sessions.update(session, expected);
	if (!saved) {
		throw new DomainError(
			"concurrent_update",
			"The session changed in the meantime",
			{ sessionId: session.id },
		);
	}
}
