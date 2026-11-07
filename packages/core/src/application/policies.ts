// Limits. Changing them closes the current policy and creates another, so the
// history stays. The new one applies to the whole current week.
// The general quota exists while two or more active activities draw from it:
// when a change leaves it with one, it becomes that activity's own quota
// (same limits); with none, it closes.
import { type Actor, requireParent } from "../domain/actor";
import {
	generalMembers,
	MIN_GENERAL_MEMBERS,
	type QuotaPolicy,
	type QuotaTotals,
	quotaTotals,
	sameLimits,
} from "../domain/policy";
import { DomainError, invalidInput } from "../errors";
import { loadActivity, loadChild } from "./access";
import { type CoreDeps, transaction } from "./context";
import {
	generalNeedsTwo,
	type QuotaLimitsInput,
	replacePolicy,
	resolveLimits,
	settleGeneral,
} from "./quota-changes";

export type { QuotaLimitsInput } from "./quota-changes";

export interface SetPolicyInput extends QuotaLimitsInput {
	childId: string;
	// Omitted or null: the general quota.
	activityId?: string | null;
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
		const policies = await tx.repos.policies.listCurrent(child.id);
		if (activityId === null) {
			const activities = await tx.repos.activities.listByFamily(child.familyId);
			const members = generalMembers(policies, activities);
			if (members.length < MIN_GENERAL_MEMBERS) {
				throw generalNeedsTwo(members);
			}
		}
		const current =
			policies.find((policy) => policy.activityId === activityId) ?? null;
		const policy = await replacePolicy(
			tx,
			actor.parentId,
			child.id,
			activityId,
			resolveLimits(input, current),
		);
		await settleGeneral(tx, actor.parentId, child);
		return policy;
	});
}

export interface SetQuotaLayoutInput {
	childId: string;
	// The general quota, shared by every active activity not listed in `own`;
	// null when there is none. It needs at least two of them.
	general: QuotaLimitsInput | null;
	// The activities with a quota of their own.
	own: readonly (QuotaLimitsInput & { activityId: string })[];
}

// How the child's time is split, in one step: the general quota and the
// activities with their own. Splitting the general one between activities
// and joining them back into it are both a new layout. Only the policies that
// change are replaced, so the history does not fill up with copies. Returns
// the current policies.
export async function setQuotaLayout(
	deps: CoreDeps,
	actor: Actor,
	input: SetQuotaLayoutInput,
): Promise<QuotaPolicy[]> {
	requireParent(actor, "change the limits");
	return transaction(deps, async (tx) => {
		const child = await loadChild(
			tx,
			actor,
			input.childId,
			"change the limits",
		);
		const listed = new Set(input.own.map((entry) => entry.activityId));
		if (listed.size !== input.own.length) {
			throw invalidInput("own", "lists an activity more than once");
		}
		for (const entry of input.own) {
			await loadActivity(tx, child.familyId, entry.activityId, {
				requireActive: true,
			});
		}
		const activities = await tx.repos.activities.listByFamily(child.familyId);
		const members = activities.filter(
			(activity) => activity.isActive && !listed.has(activity.id),
		);
		if (input.general !== null && members.length < MIN_GENERAL_MEMBERS) {
			throw generalNeedsTwo(members);
		}
		if (input.general === null && members.length > 0) {
			throw new DomainError(
				"activities_without_quota",
				"Every active activity needs a quota",
				{ activityIds: members.map((activity) => activity.id) },
			);
		}

		const current = await tx.repos.policies.listCurrent(child.id);
		const currentOf = (activityId: string | null) =>
			current.find((policy) => policy.activityId === activityId) ?? null;
		const currentGeneral = currentOf(null);
		// A new general quota copies what is not sent from one of the quotas
		// it joins.
		const generalBase =
			currentGeneral ??
			members
				.map((activity) => currentOf(activity.id))
				.find((policy) => policy !== null) ??
			null;
		// Everything is validated before anything is written.
		const wanted = [
			...(input.general === null
				? []
				: [
						{
							activityId: null,
							limits: resolveLimits(input.general, generalBase),
						},
					]),
			...input.own.map((entry) => ({
				activityId: entry.activityId,
				limits: resolveLimits(
					entry,
					currentOf(entry.activityId) ?? currentGeneral,
				),
			})),
		];

		if (input.general === null && currentGeneral !== null) {
			await tx.repos.policies.closeCurrent(child.id, null, tx.now);
		}
		for (const activity of members) {
			if (currentOf(activity.id) !== null) {
				await tx.repos.policies.closeCurrent(child.id, activity.id, tx.now);
			}
		}
		for (const { activityId, limits } of wanted) {
			const before = currentOf(activityId);
			if (before === null || !sameLimits(before, limits)) {
				await replacePolicy(tx, actor.parentId, child.id, activityId, limits);
			}
		}
		return tx.repos.policies.listCurrent(child.id);
	});
}

// The child's limits in force: the general policy and/or one per activity.
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

export interface QuotasView {
	policies: QuotaPolicy[];
	// What all the bags allow together.
	totals: QuotaTotals;
}

// The limits in force and what they add up to. The child sees their own.
export async function listQuotas(
	deps: CoreDeps,
	actor: Actor,
	input: { childId: string },
): Promise<QuotasView> {
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, input.childId, "see the limits");
		const policies = await tx.repos.policies.listCurrent(child.id);
		const activities = await tx.repos.activities.listByFamily(child.familyId);
		return { policies, totals: quotaTotals(policies, activities) };
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

// An activity goes back to the general quota: its own policy is closed (it
// stays in the history). There must be a general quota to go back to; to
// join activities into a new one, use `setQuotaLayout`. Returns the closed
// policy, or null if the activity had none.
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
		const policies = await tx.repos.policies.listCurrent(child.id);
		const current =
			policies.find((policy) => policy.activityId === input.activityId) ?? null;
		if (current === null) {
			return null;
		}
		if (!policies.some((policy) => policy.activityId === null)) {
			throw new DomainError(
				"no_general_quota",
				"There is no general quota to go back to",
				{ activityId: input.activityId },
			);
		}
		await tx.repos.policies.closeCurrent(child.id, input.activityId, tx.now);
		return { ...current, validTo: tx.now };
	});
}
