// Extra time a parent grants directly (no request) once the quota is used up.
// It is used by a new session, never to extend the running one.
import { type Actor, requireParent } from "../domain/actor";
import type { QuotaOverride } from "../domain/request";
import type { Session } from "../domain/session";
import {
	minutesToSeconds,
	positiveMinutes,
	requiredText,
} from "../domain/values";
import { DomainError } from "../errors";
import { loadActivity, loadChild, loadFamily } from "./access";
import { type CoreDeps, transaction } from "./context";
import { activityBalance } from "./quota";
import { assertNoOpenSession, openSession, resolveStartAt } from "./scheduling";

export interface GrantOverrideInput {
	childId: string;
	activityId: string;
	extraMinutes: number;
	reason: string;
	// Omitted: start now. Otherwise later today.
	startAt?: Date;
}

export async function grantOverride(
	deps: CoreDeps,
	actor: Actor,
	input: GrantOverrideInput,
): Promise<{ override: QuotaOverride; session: Session }> {
	requireParent(actor, "grant extra time");
	const extraMinutes = positiveMinutes(input.extraMinutes, "extraMinutes");
	const reason = requiredText(input.reason, "reason", 500);
	return transaction(deps, async (tx) => {
		const child = await loadChild(tx, actor, input.childId, "grant extra time");
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
		if (balance.availableSeconds > 0) {
			throw new DomainError(
				"quota_not_exhausted",
				"There is time left: start a session instead",
				{ availableSeconds: balance.availableSeconds },
			);
		}
		const override: QuotaOverride = {
			id: tx.deps.ids.next(),
			childId: child.id,
			requestId: null,
			grantedByParentId: actor.parentId,
			extraMinutes,
			reason,
			createdAt: tx.now,
		};
		await tx.repos.overrides.insert(override);
		const session = await openSession(tx, {
			family,
			childId: child.id,
			activityId: input.activityId,
			requestId: null,
			overrideId: override.id,
			plannedSeconds: minutesToSeconds(extraMinutes),
			scheduledStartAt,
			parentId: actor.parentId,
			warningMinutes: policy.warningMinutes,
		});
		return { override, session };
	});
}
