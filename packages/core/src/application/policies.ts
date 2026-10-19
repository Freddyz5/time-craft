// Limits. Changing them closes the current policy and creates another, so the
// history stays. The new one applies to the whole current week.
import { type Actor, requireParent } from "../domain/actor";
import {
	policyDefaults,
	type QuotaPolicy,
	validatePolicyLimits,
} from "../domain/policy";
import { loadActivity, loadChild } from "./access";
import { type CoreDeps, transaction } from "./context";

export interface SetPolicyInput {
	childId: string;
	// Omitted or null: the global quota.
	activityId?: string | null;
	dailyLimitMinutes: number;
	weeklyLimitMinutes: number;
	// Omitted fields keep the current policy's value (or the default).
	weeklyBonusCapMinutes?: number;
	carryOverExcess?: boolean;
	warningMinutes?: number;
}

export async function setPolicy(
	deps: CoreDeps,
	actor: Actor,
	input: SetPolicyInput,
): Promise<QuotaPolicy> {
	requireParent(actor, "change the limits");
	return transaction(deps, async (tx) => {
		const child = await loadChild(
			tx,
			actor,
			input.childId,
			"change the limits",
		);
		const activityId = input.activityId ?? null;
		if (activityId !== null) {
			await loadActivity(tx, child.familyId, activityId, {
				requireActive: false,
			});
		}
		const current =
			(await tx.repos.policies.listCurrent(child.id)).find(
				(policy) => policy.activityId === activityId,
			) ?? null;
		const limits = validatePolicyLimits({
			dailyLimitMinutes: input.dailyLimitMinutes,
			weeklyLimitMinutes: input.weeklyLimitMinutes,
			weeklyBonusCapMinutes:
				input.weeklyBonusCapMinutes ??
				current?.weeklyBonusCapMinutes ??
				policyDefaults.weeklyBonusCapMinutes,
			carryOverExcess:
				input.carryOverExcess ??
				current?.carryOverExcess ??
				policyDefaults.carryOverExcess,
			warningMinutes:
				input.warningMinutes ??
				current?.warningMinutes ??
				policyDefaults.warningMinutes,
		});
		await tx.repos.policies.closeCurrent(child.id, activityId, tx.now);
		const policy: QuotaPolicy = {
			id: tx.deps.ids.next(),
			childId: child.id,
			activityId,
			...limits,
			validFrom: tx.now,
			validTo: null,
			createdByParentId: actor.parentId,
			createdAt: tx.now,
		};
		await tx.repos.policies.insert(policy);
		return policy;
	});
}

// The child's limits in force: the global policy and/or one per activity.
// The child sees their own.
export async function listCurrentPolicies(
	deps: CoreDeps,
	actor: Actor,
	input: { childId: string },
): Promise<QuotaPolicy[]> {
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, input.childId, "see the limits");
		return tx.repos.policies.listCurrent(child.id);
	});
}

// Every policy of the child, the closed ones included, newest first: changing
// a limit never rewrites the old one. The child sees their own.
export async function listPolicyHistory(
	deps: CoreDeps,
	actor: Actor,
	input: { childId: string },
): Promise<QuotaPolicy[]> {
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, input.childId, "see the limits");
		return tx.repos.policies.listByChild(child.id);
	});
}

// An activity goes back to the global quota: its own policy is closed (it
// stays in the history). The global policy itself is not removable. Returns
// the closed policy, or null if the activity had none.
export async function clearActivityPolicy(
	deps: CoreDeps,
	actor: Actor,
	input: { childId: string; activityId: string },
): Promise<QuotaPolicy | null> {
	requireParent(actor, "change the limits");
	return transaction(deps, async (tx) => {
		const child = await loadChild(
			tx,
			actor,
			input.childId,
			"change the limits",
		);
		await loadActivity(tx, child.familyId, input.activityId, {
			requireActive: false,
		});
		const current =
			(await tx.repos.policies.listCurrent(child.id)).find(
				(policy) => policy.activityId === input.activityId,
			) ?? null;
		if (current === null) {
			return null;
		}
		await tx.repos.policies.closeCurrent(child.id, input.activityId, tx.now);
		return { ...current, validTo: tx.now };
	});
}
