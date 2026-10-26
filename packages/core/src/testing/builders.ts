// Builders for domain objects in unit tests.
import type { QuotaPolicy } from "../domain/policy";
import type { Session, SessionPause } from "../domain/session";

let sequence = 0;

function nextId(prefix: string): string {
	sequence += 1;
	return `${prefix}-${sequence}`;
}

const minutes = (value: number) => value * 60;

export function policy(overrides: Partial<QuotaPolicy> = {}): QuotaPolicy {
	return {
		id: nextId("policy"),
		childId: "child",
		activityId: null,
		dailyLimitMinutes: 60,
		weeklyLimitMinutes: 300,
		weeklyBonusCapMinutes: 60,
		carryOverExcess: false,
		warningMinutes: 5,
		validFrom: new Date("2026-01-01T00:00:00Z"),
		validTo: null,
		createdByParentId: "parent",
		createdAt: new Date("2026-01-01T00:00:00Z"),
		...overrides,
	};
}

interface SessionOptions {
	activityId?: string;
	plannedMinutes?: number;
	pauses?: { from: string; to: string | null }[];
}

function base(start: string, options: SessionOptions): Session {
	const id = nextId("session");
	const pauses: SessionPause[] = (options.pauses ?? []).map((pause) => ({
		id: nextId("pause"),
		sessionId: id,
		pausedAt: new Date(pause.from),
		resumedAt: pause.to === null ? null : new Date(pause.to),
		pausedByParentId: "parent",
		resumedByParentId: pause.to === null ? null : "parent",
		reason: null,
	}));
	return {
		id,
		childId: "child",
		activityId: options.activityId ?? "game",
		requestId: null,
		overrideId: null,
		status: "running",
		scheduledStartAt: null,
		startedAt: new Date(start),
		plannedDurationSeconds: minutes(options.plannedMinutes ?? 30),
		endedAt: null,
		endReason: null,
		consumedSeconds: null,
		startedByParentId: "parent",
		endedByParentId: null,
		createdAt: new Date(start),
		pauses,
	};
}

export function runningSession(
	start: string,
	options: SessionOptions = {},
): Session {
	const session = base(start, options);
	const paused = session.pauses.some((pause) => pause.resumedAt === null);
	return { ...session, status: paused ? "paused" : "running" };
}

export function finishedSession(
	start: string,
	consumedMinutes: number,
	options: SessionOptions = {},
): Session {
	const session = base(start, options);
	const startedAt = new Date(start);
	return {
		...session,
		status: "finished",
		endedAt: new Date(startedAt.getTime() + consumedMinutes * 60_000),
		endReason: "completed",
		consumedSeconds: minutes(consumedMinutes),
		endedByParentId: "parent",
	};
}

export function scheduledSession(
	at: string,
	options: SessionOptions = {},
): Session {
	return {
		...base(at, options),
		status: "scheduled",
		scheduledStartAt: new Date(at),
		startedAt: null,
	};
}
