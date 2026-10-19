// What happened in a period (this week by default): sessions, time used per
// activity, requests, overrides and task reports. Read-only for everyone in
// the family; the child sees their own.
import type { Actor } from "../domain/actor";
import { attributeSession } from "../domain/attribution";
import type { TaskReport } from "../domain/bonus";
import { type Period, weekPeriod } from "../domain/calendar";
import {
	type ChildRequest,
	isOverdue,
	markExpired,
	type QuotaOverride,
} from "../domain/request";
import type { Session } from "../domain/session";
import { invalidInput } from "../errors";
import { loadChild, loadFamily } from "./access";
import { type CoreDeps, transaction } from "./context";
import { calendarOf } from "./quota";

// The longest period one query may cover: about a quarter.
export const MAX_HISTORY_DAYS = 92;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActivityUsage {
	activityId: string;
	// Counted the same way as the balance (imputation strategy).
	consumedSeconds: number;
}

export interface ChildHistory {
	serverTime: Date;
	childId: string;
	period: Period;
	// Sessions that started (or were scheduled to start) in the period, newest
	// first.
	sessions: Session[];
	usageByActivity: ActivityUsage[];
	// Newest first, any status.
	requests: ChildRequest[];
	overrides: QuotaOverride[];
	taskReports: TaskReport[];
}

export interface HistoryInput {
	childId: string;
	// Both or neither; neither means the current week.
	from?: Date;
	to?: Date;
}

function validPeriod(input: HistoryInput): Period | null {
	if (input.from === undefined && input.to === undefined) {
		return null;
	}
	if (input.from === undefined || input.to === undefined) {
		throw invalidInput("period", "from and to go together");
	}
	const span = input.to.getTime() - input.from.getTime();
	if (span <= 0) {
		throw invalidInput("to", "must be after from");
	}
	if (span > MAX_HISTORY_DAYS * DAY_MS) {
		throw invalidInput("period", `must be at most ${MAX_HISTORY_DAYS} days`);
	}
	return { start: input.from, end: input.to };
}

export async function getChildHistory(
	deps: CoreDeps,
	actor: Actor,
	input: HistoryInput,
): Promise<ChildHistory> {
	const requested = validPeriod(input);
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, input.childId, "see the history");
		const family = await loadFamily(tx, child.familyId);
		const period = requested ?? weekPeriod(tx.now, calendarOf(family));

		const sessions = await tx.repos.sessions.listByChildStartingIn(
			child.id,
			period,
		);
		// The strategy decides what counts in the period; this list is a
		// superset of what any strategy needs.
		const usage = new Map<string, number>();
		for (const session of await tx.repos.sessions.listStartedOverlapping(
			child.id,
			period,
		)) {
			const { consumedSeconds } = attributeSession(session, period, tx.now);
			if (consumedSeconds > 0) {
				usage.set(
					session.activityId,
					(usage.get(session.activityId) ?? 0) + consumedSeconds,
				);
			}
		}

		// Lazy expiry, as everywhere else a pending request is read.
		const requests: ChildRequest[] = [];
		for (const request of await tx.repos.requests.listByChildCreatedIn(
			child.id,
			period,
		)) {
			if (isOverdue(request, tx.now)) {
				const expired = markExpired(request);
				await tx.repos.requests.updateIfPending(expired);
				requests.push(expired);
			} else {
				requests.push(request);
			}
		}

		return {
			serverTime: tx.now,
			childId: child.id,
			period,
			sessions,
			usageByActivity: [...usage].map(([activityId, consumedSeconds]) => ({
				activityId,
				consumedSeconds,
			})),
			requests,
			overrides: await tx.repos.overrides.listByChildCreatedIn(
				child.id,
				period,
			),
			taskReports: await tx.repos.taskReports.listByChildReportedIn(
				child.id,
				period,
			),
		};
	});
}
