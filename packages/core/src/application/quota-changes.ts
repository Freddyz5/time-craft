// Writing quotas, shared by the limits and the activities: completing the
// limits, replacing a policy and keeping the general quota for two or more
// activities. Internal to the application layer.
import type { Activity, Child } from "../domain/family";
import {
	generalMembers,
	MIN_GENERAL_MEMBERS,
	type PolicyLimits,
	policyDefaults,
	type QuotaPolicy,
	type ValidPolicyLimits,
	validatePolicyLimits,
} from "../domain/policy";
import { DomainError } from "../errors";
import type { Tx } from "./context";

export interface QuotaLimitsInput {
	dailyLimitMinutes: number;
	weeklyLimitMinutes: number;
	// Omitted fields keep the value of the policy it replaces (or the
	// default).
	weeklyBonusCapMinutes?: number;
	carryOverExcess?: boolean;
	warningMinutes?: number;
	// 0 = Sunday ... 6 = Saturday.
	allowedDays?: readonly number[];
	graceMinutes?: number;
}

// The limits to save: the input, completed with `base` (the policy it
// replaces, or another one to copy from) or the defaults.
export function resolveLimits(
	input: QuotaLimitsInput,
	base: PolicyLimits | null,
): ValidPolicyLimits {
	return validatePolicyLimits({
		dailyLimitMinutes: input.dailyLimitMinutes,
		weeklyLimitMinutes: input.weeklyLimitMinutes,
		weeklyBonusCapMinutes:
			input.weeklyBonusCapMinutes ??
			base?.weeklyBonusCapMinutes ??
			policyDefaults.weeklyBonusCapMinutes,
		carryOverExcess:
			input.carryOverExcess ??
			base?.carryOverExcess ??
			policyDefaults.carryOverExcess,
		warningMinutes:
			input.warningMinutes ??
			base?.warningMinutes ??
			policyDefaults.warningMinutes,
		allowedDays:
			input.allowedDays ?? base?.allowedDays ?? policyDefaults.allowedDays,
		graceMinutes:
			input.graceMinutes ?? base?.graceMinutes ?? policyDefaults.graceMinutes,
	});
}

export function limitsOf(policy: QuotaPolicy): ValidPolicyLimits {
	return {
		dailyLimitMinutes: policy.dailyLimitMinutes,
		weeklyLimitMinutes: policy.weeklyLimitMinutes,
		weeklyBonusCapMinutes: policy.weeklyBonusCapMinutes,
		carryOverExcess: policy.carryOverExcess,
		warningMinutes: policy.warningMinutes,
		allowedDays: [...policy.allowedDays],
		graceMinutes: policy.graceMinutes,
	};
}

// Closes the current policy of (child, activity), if any, and creates one
// with these limits.
export async function replacePolicy(
	tx: Tx,
	parentId: string,
	childId: string,
	activityId: string | null,
	limits: ValidPolicyLimits,
): Promise<QuotaPolicy> {
	await tx.repos.policies.closeCurrent(childId, activityId, tx.now);
	const policy: QuotaPolicy = {
		id: tx.deps.ids.next(),
		childId,
		activityId,
		...limits,
		validFrom: tx.now,
		validTo: null,
		createdByParentId: parentId,
		createdAt: tx.now,
	};
	await tx.repos.policies.insert(policy);
	return policy;
}

export function generalNeedsTwo(members: readonly Activity[]): DomainError {
	return new DomainError(
		"general_needs_two_activities",
		"The general quota needs at least two activities drawing from it",
		{ activityIds: members.map((activity) => activity.id) },
	);
}

// A general quota left with fewer than two activities stops: with one, it
// becomes that activity's own quota, with the same limits; with none, it
// closes. Its history stays.
export async function settleGeneral(
	tx: Tx,
	parentId: string,
	child: Child,
): Promise<void> {
	const policies = await tx.repos.policies.listCurrent(child.id);
	const general = policies.find((policy) => policy.activityId === null);
	if (general === undefined) {
		return;
	}
	const activities = await tx.repos.activities.listByFamily(child.familyId);
	const members = generalMembers(policies, activities);
	if (members.length >= MIN_GENERAL_MEMBERS) {
		return;
	}
	await tx.repos.policies.closeCurrent(child.id, null, tx.now);
	const [only] = members;
	if (only !== undefined) {
		await replacePolicy(tx, parentId, child.id, only.id, limitsOf(general));
	}
}
