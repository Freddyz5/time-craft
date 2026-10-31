// The timer. Parents start, pause, resume and stop sessions; jobs start the
// scheduled ones and close the forgotten ones. The child only watches.
import { type Actor, requireParent } from "../domain/actor";
import { RUNNING_ALERT_TYPES } from "../domain/alerts";
import {
	assertFitsCap,
	quotaExhausted,
	sessionCapSeconds,
} from "../domain/balance";
import type { Activity, Child, Family } from "../domain/family";
import { policyDefaults, policyForActivity } from "../domain/policy";
import { messages } from "../domain/push";
import {
	assertTransition,
	elapsedSeconds,
	markCancelled,
	markFinished,
	markPaused,
	markResumed,
	markStarted,
	remainingSeconds,
	type Session,
	stopReason,
} from "../domain/session";
import {
	addSeconds,
	minutesToSeconds,
	optionalText,
	positiveMinutes,
	secondsToMinutesCeil,
} from "../domain/values";
import {
	loadActivity,
	loadChild,
	loadChildById,
	loadFamily,
	loadSession,
	parentUserIds,
} from "./access";
import { type CoreDeps, type Tx, transaction } from "./context";
import { activityBalance, findActivityBalance } from "./quota";
import {
	assertNoOpenSession,
	cancelPendingAlerts,
	openSession,
	resolveStartAt,
	saveTransition,
	scheduleRunningAlerts,
} from "./scheduling";

export interface StartDirectSessionInput {
	childId: string;
	activityId: string;
	minutes: number;
	// Omitted: start now. Otherwise later today.
	startAt?: Date;
}

// A parent starts a session without a request, now or later today. Its
// duration never exceeds the time available.
export async function startDirectSession(
	deps: CoreDeps,
	actor: Actor,
	input: StartDirectSessionInput,
): Promise<Session> {
	requireParent(actor, "start a session");
	const minutes = positiveMinutes(input.minutes, "minutes");
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, input.childId, "start a session");
		const family = await loadFamily(tx, child.familyId);
		await loadActivity(tx, family.id, input.activityId, {
			requireActive: true,
		});
		const scheduledStartAt = resolveStartAt(input.startAt, tx.now, family);
		await assertNoOpenSession(tx, child.id);
		const { policy, balance } = await activityBalance(
			tx,
			family,
			child.id,
			input.activityId,
		);
		const plannedSeconds = minutesToSeconds(minutes);
		assertFitsCap(plannedSeconds, sessionCapSeconds(balance));
		return openSession(tx, {
			family,
			childId: child.id,
			activityId: input.activityId,
			requestId: null,
			overrideId: null,
			plannedSeconds,
			scheduledStartAt,
			parentId: actor.parentId,
			warningMinutes: policy.warningMinutes,
		});
	});
}

interface StartPlan {
	// Planned duration trimmed to what is available now (0: nothing left).
	plannedSeconds: number;
	warningMinutes: number;
}

// When a scheduled session starts, its duration shrinks to what is available
// at that moment (plus its override, if it has one).
async function planScheduledStart(
	tx: Tx,
	family: Family,
	session: Session,
): Promise<StartPlan> {
	const entry = await findActivityBalance(
		tx,
		family,
		session.childId,
		session.activityId,
	);
	if (entry === null) {
		// Without limits there is nothing to draw from.
		return { plannedSeconds: 0, warningMinutes: 0 };
	}
	const override =
		session.overrideId === null
			? null
			: await tx.repos.overrides.findById(session.overrideId);
	const cap = sessionCapSeconds(entry.balance, override?.extraMinutes ?? 0);
	return {
		plannedSeconds: Math.max(0, Math.min(session.plannedDurationSeconds, cap)),
		warningMinutes: entry.policy.warningMinutes,
	};
}

async function beginScheduled(
	tx: Tx,
	session: Session,
	plan: StartPlan,
	family: Family,
	child: Child,
	activity: Activity,
): Promise<Session> {
	const started = markStarted(session, tx.now, plan.plannedSeconds);
	await saveTransition(tx, started, "scheduled");
	await cancelPendingAlerts(tx, session.id, ["start"]);
	await scheduleRunningAlerts(tx, started, {
		warningMinutes: plan.warningMinutes,
		autoCloseAfterMinutes: family.autoCloseAfterMinutes,
	});
	tx.after.notify(
		[child.authUserId],
		messages.sessionReady({
			sessionId: session.id,
			activityName: activity.name,
			minutes: secondsToMinutesCeil(plan.plannedSeconds),
		}),
	);
	return started;
}

export type ScheduledStartResult =
	| { outcome: "started"; session: Session }
	| { outcome: "cancelled"; session: Session };

// Job handler for `start` (see handleJob). Trims the duration to what is
// available; with nothing left, cancels the session and tells everyone. The
// schema needs a parent as the one who cancels: the one who scheduled it.
export async function startScheduledSession(
	tx: Tx,
	session: Session,
): Promise<ScheduledStartResult> {
	const child = await loadChildById(tx, session.childId);
	const family = await loadFamily(tx, child.familyId);
	const activity = await loadActivity(tx, family.id, session.activityId, {
		requireActive: false,
	});
	const plan = await planScheduledStart(tx, family, session);
	if (plan.plannedSeconds > 0) {
		return {
			outcome: "started",
			session: await beginScheduled(tx, session, plan, family, child, activity),
		};
	}
	const cancelled = markCancelled(session, tx.now, session.startedByParentId);
	await saveTransition(tx, cancelled, "scheduled");
	await cancelPendingAlerts(tx, session.id, ["start"]);
	const text = {
		sessionId: session.id,
		childName: child.name,
		activityName: activity.name,
	};
	tx.after.notify(
		await parentUserIds(tx, family.id),
		messages.sessionCancelledNoTime({ ...text, audience: "parents" }),
	);
	tx.after.notify(
		[child.authUserId],
		messages.sessionCancelledNoTime({ ...text, audience: "child" }),
	);
	return { outcome: "cancelled", session: cancelled };
}

// A parent starts a scheduled session now. Its `start` job is cancelled.
export async function advanceScheduledSession(
	deps: CoreDeps,
	actor: Actor,
	input: { sessionId: string },
): Promise<Session> {
	requireParent(actor, "start a scheduled session now");
	return transaction(deps, async (tx) => {
		const { session, child } = await loadSession(
			tx,
			actor,
			input.sessionId,
			"start a scheduled session now",
		);
		assertTransition(session, "running");
		const family = await loadFamily(tx, child.familyId);
		const activity = await loadActivity(tx, family.id, session.activityId, {
			requireActive: false,
		});
		const plan = await planScheduledStart(tx, family, session);
		if (plan.plannedSeconds === 0) {
			throw quotaExhausted();
		}
		return beginScheduled(tx, session, plan, family, child, activity);
	});
}

// A parent cancels a session scheduled for later. Its `start` job is cancelled.
export async function cancelScheduledSession(
	deps: CoreDeps,
	actor: Actor,
	input: { sessionId: string },
): Promise<Session> {
	requireParent(actor, "cancel a scheduled session");
	return transaction(deps, async (tx) => {
		const { session } = await loadSession(
			tx,
			actor,
			input.sessionId,
			"cancel a scheduled session",
		);
		const cancelled = markCancelled(session, tx.now, actor.parentId);
		await saveTransition(tx, cancelled, "scheduled");
		await cancelPendingAlerts(tx, session.id, ["start"]);
		return cancelled;
	});
}

// A pause does not consume. Its warning, end and auto_close jobs are cancelled.
export async function pauseSession(
	deps: CoreDeps,
	actor: Actor,
	input: { sessionId: string; reason?: string },
): Promise<Session> {
	requireParent(actor, "pause a session");
	const reason = optionalText(input.reason, "reason", 120);
	return transaction(deps, async (tx) => {
		const { session } = await loadSession(
			tx,
			actor,
			input.sessionId,
			"pause a session",
		);
		const paused = markPaused(session, {
			id: tx.deps.ids.next(),
			at: tx.now,
			parentId: actor.parentId,
			reason,
		});
		await saveTransition(tx, paused, "running");
		await cancelPendingAlerts(tx, session.id, RUNNING_ALERT_TYPES);
		return paused;
	});
}

// Resuming schedules new warning, end and auto_close jobs from now.
export async function resumeSession(
	deps: CoreDeps,
	actor: Actor,
	input: { sessionId: string },
): Promise<Session> {
	requireParent(actor, "resume a session");
	return transaction(deps, async (tx) => {
		const { session, child } = await loadSession(
			tx,
			actor,
			input.sessionId,
			"resume a session",
		);
		const resumed = markResumed(session, tx.now, actor.parentId);
		await saveTransition(tx, resumed, "paused");
		const family = await loadFamily(tx, child.familyId);
		const policy = policyForActivity(
			await tx.repos.policies.listCurrent(child.id),
			session.activityId,
		);
		await scheduleRunningAlerts(tx, resumed, {
			warningMinutes: policy?.warningMinutes ?? policyDefaults.warningMinutes,
			autoCloseAfterMinutes: family.autoCloseAfterMinutes,
		});
		return resumed;
	});
}

// A parent stops a running or paused session. It consumes the real time,
// overrun included: `completed` if it reached its end, `stopped_early` if not.
export async function stopSession(
	deps: CoreDeps,
	actor: Actor,
	input: { sessionId: string },
): Promise<Session> {
	requireParent(actor, "stop a session");
	return transaction(deps, async (tx) => {
		const { session, child } = await loadSession(
			tx,
			actor,
			input.sessionId,
			"stop a session",
		);
		// Past its end the alarm may still be ringing somewhere.
		if (remainingSeconds(session, tx.now) <= 0) {
			await notifyAlarmStopped(tx, session.id, child);
		}
		const consumed = elapsedSeconds(session, tx.now);
		const finished = markFinished(session, {
			at: tx.now,
			reason: stopReason(session, consumed),
			parentId: actor.parentId,
			consumedSeconds: consumed,
		});
		await saveTransition(tx, finished, session.status);
		await cancelPendingAlerts(tx, session.id, [
			"start",
			...RUNNING_ALERT_TYPES,
		]);
		return finished;
	});
}

// Someone noticed the end: every device of the family goes quiet, parents'
// and child's alike, whoever stopped it.
export async function stopAlarm(
	deps: CoreDeps,
	actor: Actor,
	input: { sessionId: string },
): Promise<void> {
	await transaction(deps, async (tx) => {
		const { session, child } = await loadSession(
			tx,
			actor,
			input.sessionId,
			"stop an alarm",
		);
		await notifyAlarmStopped(tx, session.id, child);
	});
}

async function notifyAlarmStopped(
	tx: Tx,
	sessionId: string,
	child: Child,
): Promise<void> {
	const parents = await parentUserIds(tx, child.familyId);
	tx.after.notify(
		parents,
		messages.alarmStopped({ sessionId, audience: "parents" }),
	);
	tx.after.notify(
		[child.authUserId],
		messages.alarmStopped({ sessionId, audience: "child" }),
	);
}

// Job handler for `auto_close` (see handleJob): nobody stopped the session, so
// the server closes it. It consumes the planned time plus the margin.
export async function autoCloseSession(
	tx: Tx,
	session: Session,
): Promise<Session> {
	const child = await loadChildById(tx, session.childId);
	const family = await loadFamily(tx, child.familyId);
	const activity = await loadActivity(tx, family.id, session.activityId, {
		requireActive: false,
	});
	const consumed =
		session.plannedDurationSeconds +
		minutesToSeconds(family.autoCloseAfterMinutes);
	const finished = markFinished(session, {
		at: tx.now,
		reason: "auto_closed",
		parentId: null,
		consumedSeconds: consumed,
	});
	await saveTransition(tx, finished, "running");
	await cancelPendingAlerts(tx, session.id, RUNNING_ALERT_TYPES);
	tx.after.notify(
		await parentUserIds(tx, family.id),
		messages.sessionAutoClosed({
			sessionId: session.id,
			childName: child.name,
			activityName: activity.name,
			consumedMinutes: secondsToMinutesCeil(consumed),
		}),
	);
	return finished;
}

export interface LiveSession {
	session: Session;
	elapsedSeconds: number;
	// Negative once past the planned end.
	remainingSeconds: number;
	// When it reaches its planned end if nobody pauses it; null unless running.
	endsAt: Date | null;
}

export interface LiveSessionView {
	// Clients compute their clock offset from it, so a phone with the wrong
	// time still shows the same remaining time as everyone else.
	serverTime: Date;
	live: LiveSession | null;
}

// The child's scheduled, running or paused session, if any.
export async function getLiveSession(
	deps: CoreDeps,
	actor: Actor,
	input: { childId: string },
): Promise<LiveSessionView> {
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, input.childId, "see the session");
		const session = await tx.repos.sessions.findOpenByChild(child.id);
		if (session === null) {
			return { serverTime: tx.now, live: null };
		}
		const remaining = remainingSeconds(session, tx.now);
		return {
			serverTime: tx.now,
			live: {
				session,
				elapsedSeconds: elapsedSeconds(session, tx.now),
				remainingSeconds: remaining,
				endsAt:
					session.status === "running" ? addSeconds(tx.now, remaining) : null,
			},
		};
	});
}
