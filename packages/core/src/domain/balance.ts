// The balance is never stored: it is computed from the sessions.
//   consumed     = closed sessions' consumed_seconds + elapsed of the open one
//   bonus        = min(Σ bonus minutes approved this week, weekly_bonus_cap)
//   available    = min(daily_limit − consumed_today,
//                      weekly_limit + bonus − consumed_week)
// The override's extra minutes are added on top, only for the session that
// uses it (see `sessionCapSeconds`).
import { DomainError } from "../errors";
import { type AttributionStrategy, attributeSession } from "./attribution";
import {
	type CalendarSettings,
	dayPeriod,
	type Period,
	previousDayPeriod,
	weekPeriod,
} from "./calendar";
import type { QuotaPolicy } from "./policy";
import type { Session } from "./session";
import { minutesToSeconds } from "./values";

export interface Balance {
	policyId: string;
	// null: the global quota.
	activityId: string | null;
	today: Period;
	week: Period;
	dailyLimitSeconds: number;
	weeklyLimitSeconds: number;
	consumedTodaySeconds: number;
	consumedWeekSeconds: number;
	// Yesterday's overrun, taken from today when the policy carries it over.
	carriedExcessSeconds: number;
	bonusEarnedSeconds: number;
	bonusCapSeconds: number;
	// Earned bonus after the cap: what the week actually gains.
	bonusSeconds: number;
	dailyRemainingSeconds: number;
	// Includes the capped bonus.
	weeklyRemainingSeconds: number;
	availableSeconds: number;
	nextDailyRechargeAt: Date;
	nextWeeklyRechargeAt: Date;
}

export interface BalanceInput {
	policy: QuotaPolicy;
	// The sessions that draw from this policy (see `sessionsUnderPolicy`),
	// covering at least `balanceWindow(now)`.
	sessions: readonly Session[];
	// Σ awarded minutes of the bonuses approved this week (see `weeklyBonusMinutes`).
	bonusMinutesEarned: number;
	now: Date;
	calendar: CalendarSettings;
	attribution?: AttributionStrategy;
}

// The sessions a balance needs: this week, plus yesterday for the carried
// excess (yesterday may belong to the previous week).
export function balanceWindow(now: Date, calendar: CalendarSettings): Period {
	const week = weekPeriod(now, calendar);
	const yesterday = previousDayPeriod(now, calendar);
	return {
		start:
			yesterday.start.getTime() < week.start.getTime()
				? yesterday.start
				: week.start,
		end: week.end,
	};
}

export function computeBalance(input: BalanceInput): Balance {
	const { policy, sessions, now, calendar } = input;
	const attribute = input.attribution ?? attributeSession;
	const today = dayPeriod(now, calendar);
	const week = weekPeriod(now, calendar);
	const yesterday = previousDayPeriod(now, calendar);

	let consumedToday = 0;
	let consumedWeek = 0;
	let overrunYesterday = 0;
	for (const session of sessions) {
		consumedToday += attribute(session, today, now).consumedSeconds;
		consumedWeek += attribute(session, week, now).consumedSeconds;
		overrunYesterday += attribute(session, yesterday, now).overrunSeconds;
	}

	const dailyLimit = minutesToSeconds(policy.dailyLimitMinutes);
	const weeklyLimit = minutesToSeconds(policy.weeklyLimitMinutes);
	const bonusEarned = minutesToSeconds(input.bonusMinutesEarned);
	const bonusCap = minutesToSeconds(policy.weeklyBonusCapMinutes);
	const bonus = Math.min(bonusEarned, bonusCap);
	const carried = policy.carryOverExcess ? overrunYesterday : 0;

	const dailyRemaining = Math.max(0, dailyLimit - carried - consumedToday);
	const weeklyRemaining = Math.max(0, weeklyLimit + bonus - consumedWeek);

	return {
		policyId: policy.id,
		activityId: policy.activityId,
		today,
		week,
		dailyLimitSeconds: dailyLimit,
		weeklyLimitSeconds: weeklyLimit,
		consumedTodaySeconds: consumedToday,
		consumedWeekSeconds: consumedWeek,
		carriedExcessSeconds: carried,
		bonusEarnedSeconds: bonusEarned,
		bonusCapSeconds: bonusCap,
		bonusSeconds: bonus,
		dailyRemainingSeconds: dailyRemaining,
		weeklyRemainingSeconds: weeklyRemaining,
		availableSeconds: Math.min(dailyRemaining, weeklyRemaining),
		nextDailyRechargeAt: today.end,
		nextWeeklyRechargeAt: week.end,
	};
}

// The most a new session may last: what is available plus the override's
// extra minutes, if the session uses one.
export function sessionCapSeconds(
	balance: Balance,
	overrideExtraMinutes = 0,
): number {
	return balance.availableSeconds + minutesToSeconds(overrideExtraMinutes);
}

export function quotaExhausted(): DomainError {
	return new DomainError("quota_exhausted", "No time available", {
		availableSeconds: 0,
	});
}

// A proposed session never exceeds the cap.
export function assertFitsCap(
	plannedSeconds: number,
	capSeconds: number,
): void {
	if (capSeconds <= 0) {
		throw quotaExhausted();
	}
	if (plannedSeconds > capSeconds) {
		throw new DomainError(
			"exceeds_available",
			"The session is longer than the time available",
			{ availableSeconds: capSeconds, requestedSeconds: plannedSeconds },
		);
	}
}
