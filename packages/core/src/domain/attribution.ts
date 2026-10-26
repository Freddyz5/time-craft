// Imputation strategy: how much of a session counts toward a day or a week.
// This is the only place that decides it. Decided rule (option A): the whole
// session counts toward the day (and week) it started in, even if it crosses
// midnight or the start of a new week. Option B (splitting it by stretches)
// would replace `attributeSession` without touching the schema; since the
// balance is always computed, the history would be recomputed too.
import { isWithin, type Period } from "./calendar";
import { consumedSeconds, type Session } from "./session";

export interface PeriodUsage {
	// Seconds of the session that count toward the period.
	consumedSeconds: number;
	// Part of those seconds past the planned duration (the overrun). Only used
	// when the policy carries the excess over to the next day.
	overrunSeconds: number;
}

export type AttributionStrategy = (
	session: Session,
	period: Period,
	now: Date,
) => PeriodUsage;

const none: PeriodUsage = { consumedSeconds: 0, overrunSeconds: 0 };

export const attributeToStartDay: AttributionStrategy = (
	session,
	period,
	now,
) => {
	if (session.startedAt === null || !isWithin(session.startedAt, period)) {
		return none;
	}
	const consumed = consumedSeconds(session, now);
	return {
		consumedSeconds: consumed,
		overrunSeconds: Math.max(0, consumed - session.plannedDurationSeconds),
	};
};

export const attributeSession: AttributionStrategy = attributeToStartDay;
