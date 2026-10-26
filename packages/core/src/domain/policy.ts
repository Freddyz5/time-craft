// Quota policies: daily and weekly limits with history (valid_from/valid_to).
// activity_id null is the global quota (game and TV share one bag); a policy
// with an activity is a separate bag for that activity. The policy in force
// when the balance is computed applies to the whole week (decided).
import { invalidInput } from "../errors";
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
	validFrom: Date;
	validTo: Date | null;
	createdByParentId: string;
	createdAt: Date;
}

// Same defaults as the schema.
export const policyDefaults = {
	weeklyBonusCapMinutes: 60,
	carryOverExcess: false,
	warningMinutes: 5,
} as const;

const MAX_WEEK_MINUTES = 7 * MAX_MINUTES;

export interface PolicyLimits {
	dailyLimitMinutes: number;
	weeklyLimitMinutes: number;
	weeklyBonusCapMinutes: number;
	carryOverExcess: boolean;
	warningMinutes: number;
}

export function validatePolicyLimits(limits: PolicyLimits): PolicyLimits {
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
	return limits;
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
