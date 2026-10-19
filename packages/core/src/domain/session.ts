// A screen-time session and its state machine:
//   scheduled → running ⇄ paused → finished
//   scheduled → cancelled
// The server keeps start, planned duration and pauses; elapsed and remaining
// time are computed from them, so every client sees the same clock.
// Transitions are pure: they return a new Session and never mutate the input.
import { DomainError } from "../errors";

export type SessionStatus =
	| "scheduled"
	| "running"
	| "paused"
	| "finished"
	| "cancelled";

export type EndReason = "completed" | "stopped_early" | "auto_closed";

// At most one of these per child (partial unique index in the database).
export const OPEN_SESSION_STATUSES: readonly SessionStatus[] = [
	"scheduled",
	"running",
	"paused",
];

export interface SessionPause {
	id: string;
	sessionId: string;
	pausedAt: Date;
	resumedAt: Date | null;
	pausedByParentId: string;
	resumedByParentId: string | null;
	reason: string | null;
}

export interface Session {
	id: string;
	childId: string;
	activityId: string;
	requestId: string | null;
	overrideId: string | null;
	status: SessionStatus;
	scheduledStartAt: Date | null;
	startedAt: Date | null;
	plannedDurationSeconds: number;
	endedAt: Date | null;
	endReason: EndReason | null;
	consumedSeconds: number | null;
	startedByParentId: string;
	endedByParentId: string | null;
	createdAt: Date;
	pauses: SessionPause[];
}

const transitions: Record<SessionStatus, readonly SessionStatus[]> = {
	scheduled: ["running", "cancelled"],
	running: ["paused", "finished"],
	paused: ["running", "finished"],
	finished: [],
	cancelled: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
	return transitions[from].includes(to);
}

export function assertTransition(session: Session, to: SessionStatus): void {
	if (!canTransition(session.status, to)) {
		throw new DomainError(
			"invalid_session_transition",
			`A ${session.status} session cannot become ${to}`,
			{ sessionId: session.id, from: session.status, to },
		);
	}
}

export function isOpen(session: Session): boolean {
	return OPEN_SESSION_STATUSES.includes(session.status);
}

interface NewSession {
	id: string;
	childId: string;
	activityId: string;
	requestId: string | null;
	overrideId: string | null;
	plannedDurationSeconds: number;
	startedByParentId: string;
	now: Date;
}

function assertPlanned(seconds: number): void {
	if (!Number.isInteger(seconds) || seconds <= 0) {
		throw new DomainError(
			"invalid_input",
			"plannedDurationSeconds must be a positive integer",
			{ field: "plannedDurationSeconds", reason: "must be positive" },
		);
	}
}

export function createRunningSession(input: NewSession): Session {
	assertPlanned(input.plannedDurationSeconds);
	return {
		id: input.id,
		childId: input.childId,
		activityId: input.activityId,
		requestId: input.requestId,
		overrideId: input.overrideId,
		status: "running",
		scheduledStartAt: null,
		startedAt: input.now,
		plannedDurationSeconds: input.plannedDurationSeconds,
		endedAt: null,
		endReason: null,
		consumedSeconds: null,
		startedByParentId: input.startedByParentId,
		endedByParentId: null,
		createdAt: input.now,
		pauses: [],
	};
}

export function createScheduledSession(
	input: NewSession & { scheduledStartAt: Date },
): Session {
	assertPlanned(input.plannedDurationSeconds);
	return {
		...createRunningSession(input),
		status: "scheduled",
		scheduledStartAt: input.scheduledStartAt,
		startedAt: null,
	};
}

// scheduled → running, now. The duration may shrink to what is available.
export function markStarted(
	session: Session,
	at: Date,
	plannedDurationSeconds: number,
): Session {
	assertTransition(session, "running");
	assertPlanned(plannedDurationSeconds);
	return {
		...session,
		status: "running",
		startedAt: at,
		plannedDurationSeconds,
	};
}

// scheduled → cancelled. The schema requires a parent as the one who cancels.
export function markCancelled(
	session: Session,
	at: Date,
	parentId: string,
): Session {
	assertTransition(session, "cancelled");
	return {
		...session,
		status: "cancelled",
		endedAt: at,
		endedByParentId: parentId,
	};
}

export function markPaused(
	session: Session,
	pause: { id: string; at: Date; parentId: string; reason: string | null },
): Session {
	assertTransition(session, "paused");
	return {
		...session,
		status: "paused",
		pauses: [
			...session.pauses,
			{
				id: pause.id,
				sessionId: session.id,
				pausedAt: pause.at,
				resumedAt: null,
				pausedByParentId: pause.parentId,
				resumedByParentId: null,
				reason: pause.reason,
			},
		],
	};
}

function closeOpenPause(
	pauses: SessionPause[],
	at: Date,
	parentId: string | null,
): SessionPause[] {
	return pauses.map((pause) =>
		pause.resumedAt === null
			? { ...pause, resumedAt: at, resumedByParentId: parentId }
			: pause,
	);
}

export function markResumed(
	session: Session,
	at: Date,
	parentId: string,
): Session {
	assertTransition(session, "running");
	return {
		...session,
		status: "running",
		pauses: closeOpenPause(session.pauses, at, parentId),
	};
}

// running | paused → finished. A pause still open is closed at the same
// instant, so the stored pauses always add up to the consumed time.
export function markFinished(
	session: Session,
	end: {
		at: Date;
		reason: EndReason;
		parentId: string | null;
		consumedSeconds: number;
	},
): Session {
	assertTransition(session, "finished");
	return {
		...session,
		status: "finished",
		endedAt: end.at,
		endReason: end.reason,
		consumedSeconds: end.consumedSeconds,
		endedByParentId: end.parentId,
		pauses: closeOpenPause(session.pauses, end.at, end.parentId),
	};
}

function pausedMilliseconds(session: Session, now: Date): number {
	return session.pauses.reduce((total, pause) => {
		const end = pause.resumedAt ?? now;
		return total + Math.max(0, end.getTime() - pause.pausedAt.getTime());
	}, 0);
}

// Active time so far: now − started_at − pauses (an open pause counts up to
// now). Whole seconds, never negative.
export function elapsedSeconds(session: Session, now: Date): number {
	if (session.startedAt === null) {
		return 0;
	}
	const until = session.endedAt ?? now;
	const active =
		until.getTime() -
		session.startedAt.getTime() -
		pausedMilliseconds(session, until);
	return Math.max(0, Math.floor(active / 1000));
}

// Negative once the session runs past its planned end.
export function remainingSeconds(session: Session, now: Date): number {
	return session.plannedDurationSeconds - elapsedSeconds(session, now);
}

// What the session takes from the quota. Only sessions that started consume:
// scheduled and cancelled ones count zero. A finished session counts what was
// fixed at closing (the real time, overrun included).
export function consumedSeconds(session: Session, now: Date): number {
	if (session.status === "finished") {
		return session.consumedSeconds ?? 0;
	}
	if (session.status === "running" || session.status === "paused") {
		return elapsedSeconds(session, now);
	}
	return 0;
}

export function stopReason(session: Session, consumed: number): EndReason {
	return consumed >= session.plannedDurationSeconds
		? "completed"
		: "stopped_early";
}
