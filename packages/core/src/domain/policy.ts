// Quota policies: daily and weekly limits with history (valid_from/valid_to).
// activity_id null is the general quota, a bag shared by every activity
// without a policy of its own; a policy with an activity is a separate bag
// for that activity. The general quota is only for sharing: it exists while
// two or more active activities draw from it (see `generalMembers`). The
// policy in force when the balance is computed applies to the whole week
// (decided).
// allowed_days are the days of the week its bag can be used; grace_minutes,
// how much of a session's excess never counts (copied to each session).
import { invalidInput } from "../errors";
import type { Activity, WeekDay } from "./family";
import type { Session } from "./session";
import { MAX_MINUTES, nonNegativeMinutes, positiveMinutes } from "./values";

export interface QuotaPolicy {
	id: string;
	childId: string;
	activityId: string | null;
	dailyLimitMinutes: number;
	weeklyLimitMinutes: number;
	weeklyBonusCapMinutes: number;
	carryOverExcess: boolean;
	warningMinutes: number;
	// Sorted, at least one.
	allowedDays: WeekDay[];
	graceMinutes: number;
	validFrom: Date;
	validTo: Date | null;
	createdByParentId: string;
	createdAt: Date;
}

export const ALL_WEEK_DAYS: readonly WeekDay[] = [0, 1, 2, 3, 4, 5, 6];

// Same defaults as the schema.
export const policyDefaults = {
	weeklyBonusCapMinutes: 60,
	carryOverExcess: false,
	warningMinutes: 5,
	allowedDays: ALL_WEEK_DAYS,
	graceMinutes: 0,
} as const;

const MAX_WEEK_MINUTES = 7 * MAX_MINUTES;
// Enough to reach a parent; longer would be free time, not a grace.
export const MAX_GRACE_MINUTES = 15;

export interface PolicyLimits {
	dailyLimitMinutes: number;
	weeklyLimitMinutes: number;
	weeklyBonusCapMinutes: number;
	carryOverExcess: boolean;
	warningMinutes: number;
	allowedDays: readonly number[];
	graceMinutes: number;
}

export interface ValidPolicyLimits extends PolicyLimits {
	allowedDays: WeekDay[];
}

// Each day once, in order (Sunday first); at least one.
export function normalizeAllowedDays(days: readonly number[]): WeekDay[] {
	if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
		throw invalidInput("allowedDays", "must be days of the week from 0 to 6");
	}
	const unique = ALL_WEEK_DAYS.filter((day) => days.includes(day));
	if (unique.length === 0) {
		throw invalidInput("allowedDays", "must allow at least one day");
	}
	return unique;
}

export function validatePolicyLimits(limits: PolicyLimits): ValidPolicyLimits {
	positiveMinutes(limits.dailyLimitMinutes, "dailyLimitMinutes");
	positiveMinutes(
		limits.weeklyLimitMinutes,
		"weeklyLimitMinutes",
		MAX_WEEK_MINUTES,
	);
	if (limits.weeklyLimitMinutes < limits.dailyLimitMinutes) {
		throw invalidInput(
			"weeklyLimitMinutes",
			"must be at least the daily limit",
		);
	}
	nonNegativeMinutes(
		limits.weeklyBonusCapMinutes,
		"weeklyBonusCapMinutes",
		MAX_WEEK_MINUTES,
	);
	nonNegativeMinutes(limits.warningMinutes, "warningMinutes");
	nonNegativeMinutes(limits.graceMinutes, "graceMinutes", MAX_GRACE_MINUTES);
	return { ...limits, allowedDays: normalizeAllowedDays(limits.allowedDays) };
}

export function isDayAllowed(policy: QuotaPolicy, day: WeekDay): boolean {
	return policy.allowedDays.includes(day);
}

// The bag an activity draws from: its own policy if it has one, otherwise the
// global one. `policies` are the child's current policies.
export function policyForActivity(
	policies: readonly QuotaPolicy[],
	activityId: string,
): QuotaPolicy | null {
	return (
		policies.find((policy) => policy.activityId === activityId) ??
		policies.find((policy) => policy.activityId === null) ??
		null
	);
}

// Sessions that draw from `policy`: those of its activity, or for the general
// policy those of every activity without a policy of its own, except the
// deactivated ones (what they used stops counting).
export function sessionsUnderPolicy(
	policy: QuotaPolicy,
	policies: readonly QuotaPolicy[],
	sessions: readonly Session[],
	activities: readonly Activity[] = [],
): Session[] {
	if (policy.activityId !== null) {
		return sessions.filter(
			(session) => session.activityId === policy.activityId,
		);
	}
	const ownBags = new Set(
		policies.flatMap((other) =>
			other.activityId === null ? [] : [other.activityId],
		),
	);
	const inactive = new Set(
		activities.flatMap((activity) => (activity.isActive ? [] : [activity.id])),
	);
	return sessions.filter(
		(session) =>
			!ownBags.has(session.activityId) && !inactive.has(session.activityId),
	);
}

// The general quota needs at least this many activities drawing from it.
export const MIN_GENERAL_MEMBERS = 2;

// The activities that draw from the general quota: the active ones without a
// current policy of their own. `policies` are the child's current policies.
export function generalMembers(
	policies: readonly QuotaPolicy[],
	activities: readonly Activity[],
): Activity[] {
	const ownBags = new Set(
		policies.flatMap((policy) =>
			policy.activityId === null ? [] : [policy.activityId],
		),
	);
	return activities.filter(
		(activity) => activity.isActive && !ownBags.has(activity.id),
	);
}

// Whether two policies have the same limits (saving them again changes
// nothing).
export function sameLimits(a: PolicyLimits, b: PolicyLimits): boolean {
	return (
		a.dailyLimitMinutes === b.dailyLimitMinutes &&
		a.weeklyLimitMinutes === b.weeklyLimitMinutes &&
		a.weeklyBonusCapMinutes === b.weeklyBonusCapMinutes &&
		a.carryOverExcess === b.carryOverExcess &&
		a.warningMinutes === b.warningMinutes &&
		a.graceMinutes === b.graceMinutes &&
		a.allowedDays.length === b.allowedDays.length &&
		a.allowedDays.every((day, index) => b.allowedDays[index] === day)
	);
}

export interface QuotaTotals {
	// What every bag together allows on each day of the week (index 0 =
	// Sunday): the daily limits of the bags that allow that day.
	dailyMinutesByDay: number[];
	// The weekly limits of every bag together, bonuses aside.
	weeklyMinutes: number;
}

// The bags in use: the general one while some activity draws from it, and
// the own ones of active activities.
export function bagsInUse(
	policies: readonly QuotaPolicy[],
	activities: readonly Activity[],
): QuotaPolicy[] {
	const active = new Set(
		activities.flatMap((activity) => (activity.isActive ? [activity.id] : [])),
	);
	const shared = generalMembers(policies, activities).length > 0;
	return policies.filter((policy) =>
		policy.activityId === null ? shared : active.has(policy.activityId),
	);
}

// How much time all the bags allow together. There is no cap on the total:
// each bag is separate, so this only adds them up for the parents to see.
export function quotaTotals(
	policies: readonly QuotaPolicy[],
	activities: readonly Activity[],
): QuotaTotals {
	const bags = bagsInUse(policies, activities);
	return {
		dailyMinutesByDay: ALL_WEEK_DAYS.map((day) =>
			bags.reduce(
				(total, bag) =>
					isDayAllowed(bag, day) ? total + bag.dailyLimitMinutes : total,
				0,
			),
		),
		weeklyMinutes: bags.reduce(
			(total, bag) => total + bag.weeklyLimitMinutes,
			0,
		),
	};
}
