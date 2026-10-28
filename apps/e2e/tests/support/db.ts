// Rows the screens do not show (the QStash jobs, overrides, subscriptions),
// and the few states the tests set up straight in the database: a day
// already used up, a request already past its expiry.
import {
	childRequests,
	families,
	pushSubscriptions,
	quotaOverrides,
	quotaPolicies,
	sessionAlerts,
	sessionPauses,
	sessions,
} from "@time-craft/db";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { E2eDb } from "../../src/db";
import { POLICY, type TestFamily } from "../../src/family";

export type AlertRow = typeof sessionAlerts.$inferSelect;

export function alertsOf(db: E2eDb, sessionId: string): Promise<AlertRow[]> {
	return db
		.select()
		.from(sessionAlerts)
		.where(eq(sessionAlerts.sessionId, sessionId))
		.orderBy(asc(sessionAlerts.scheduledAt));
}

export async function sessionRow(db: E2eDb, sessionId: string) {
	const [row] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.id, sessionId));
	if (row === undefined) {
		throw new Error(`Session ${sessionId} not found`);
	}
	return row;
}

// The child's most recent session, e.g. the one a screen just started.
export async function lastSession(db: E2eDb, family: TestFamily) {
	const [row] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.childId, childOf(family).id))
		.orderBy(desc(sessions.createdAt))
		.limit(1);
	if (row === undefined) {
		throw new Error("The child has no sessions");
	}
	return row;
}

export function pausesOf(db: E2eDb, sessionId: string) {
	return db
		.select()
		.from(sessionPauses)
		.where(eq(sessionPauses.sessionId, sessionId))
		.orderBy(asc(sessionPauses.pausedAt));
}

export function overridesOf(db: E2eDb, family: TestFamily) {
	return db
		.select()
		.from(quotaOverrides)
		.where(eq(quotaOverrides.childId, childOf(family).id));
}

export async function currentPolicy(db: E2eDb, family: TestFamily) {
	const [row] = await db
		.select()
		.from(quotaPolicies)
		.where(
			and(
				eq(quotaPolicies.childId, childOf(family).id),
				isNull(quotaPolicies.activityId),
				isNull(quotaPolicies.validTo),
			),
		);
	if (row === undefined) {
		throw new Error("The child has no current policy");
	}
	return row;
}

export function subscriptionsOf(db: E2eDb, authUserId: string) {
	return db
		.select()
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.authUserId, authUserId));
}

// A finished session that used `minutes` and ended a minute ago, as if
// stopped by Ana. The family's zone is about noon, so it fits in today.
export async function insertFinishedSession(
	db: E2eDb,
	family: TestFamily,
	input: { activity: "game" | "tv"; minutes: number },
): Promise<void> {
	const seconds = input.minutes * 60;
	const endedAt = new Date(Date.now() - 60_000);
	const [ana] = family.parents;
	await db.insert(sessions).values({
		childId: childOf(family).id,
		activityId: family.activities[input.activity],
		status: "finished",
		startedAt: new Date(endedAt.getTime() - seconds * 1000),
		plannedDurationSeconds: seconds,
		endedAt,
		endReason: "completed",
		consumedSeconds: seconds,
		startedByParentId: ana.id,
		endedByParentId: ana.id,
	});
}

// The whole daily limit, used: the quota is exhausted for today.
export function useUpToday(db: E2eDb, family: TestFamily): Promise<void> {
	return insertFinishedSession(db, family, {
		activity: "game",
		minutes: POLICY.dailyLimitMinutes,
	});
}

// How long after its end the server closes a forgotten session.
export async function setAutoClose(
	db: E2eDb,
	family: TestFamily,
	minutes: number,
): Promise<void> {
	await db
		.update(families)
		.set({ autoCloseAfterMinutes: minutes })
		.where(eq(families.id, family.id));
}

// As if the 15 minutes had passed without an answer.
export async function expireRequest(
	db: E2eDb,
	requestId: string,
): Promise<void> {
	await db
		.update(childRequests)
		.set({ expiresAt: new Date(Date.now() - 1000) })
		.where(eq(childRequests.id, requestId));
}

export function childOf(family: TestFamily) {
	if (family.child === null) {
		throw new Error("This family has no child");
	}
	return family.child;
}
