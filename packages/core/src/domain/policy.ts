// Quota policies: daily and weekly limits with history (valid_from/valid_to).
// activity_id null is the global quota (game and TV share one bag); a policy
// with an activity is a separate bag for that activity. The policy in force
// when the balance is computed applies to the whole week (decided).
// allowed_days are the days of the week its bag can be used; grace_minutes,
// how much of a session's excess never counts (copied to each session).
import { invalidInput } from "../errors";
import type { WeekDay } from "./family";
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

// Sessions that draw from `policy`: those of its activity, or for the global
// policy those of every activity without a policy of its own.
export function sessionsUnderPolicy(
	policy: QuotaPolicy,
	policies: readonly QuotaPolicy[],
	sessions: readonly Session[],
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
	return sessions.filter((session) => !ownBags.has(session.activityId));
}
