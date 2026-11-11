// Activities: the family's list. The parents add them, rename and recolour
// any of them (Juego and TV too) and deactivate the ones they no longer use;
// nothing is deleted, so the history keeps every session. Each child's
// quotas follow: a deactivated activity loses its own quota, and a general
// quota left with fewer than two activities stops.

import {
	activityColor,
	activityIcon,
	activityName,
	assertNameFree,
	assertRoomForActive,
	generatedCode,
} from "../domain/activity";
import { type Actor, requireParent } from "../domain/actor";
import type { Activity } from "../domain/family";
import { DomainError } from "../errors";
import { loadActivity, loadChild } from "./access";
import { type CoreDeps, type Tx, transaction } from "./context";
import {
	type QuotaLimitsInput,
	replacePolicy,
	resolveLimits,
	settleGeneral,
} from "./quota-changes";

export interface CreateActivityInput {
	name: string;
	// Keys of ACTIVITY_COLORS and ACTIVITY_ICONS.
	color: string;
	icon: string;
	// A quota of its own for a child, in the same step. Without it, the
	// activity shares that child's general quota if there is one, or has no
	// quota (and cannot be used) until the parents give it one.
	quota?: QuotaLimitsInput & { childId: string };
}

export async function createActivity(
	deps: CoreDeps,
	actor: Actor,
	input: CreateActivityInput,
): Promise<Activity> {
	requireParent(actor, "add activities");
	const name = activityName(input.name);
	const color = activityColor(input.color);
	const icon = activityIcon(input.icon);
	return transaction(deps, async (tx) => {
		const activities = await tx.repos.activities.listByFamily(actor.familyId);
		assertNameFree(name, activities);
		assertRoomForActive(activities);
		const id = tx.deps.ids.next();
		const activity: Activity = {
			id,
			familyId: actor.familyId,
			code: generatedCode(id),
			name,
			isActive: true,
			color,
			icon,
		};
		await tx.repos.activities.insert(activity);
		if (input.quota !== undefined) {
			const child = await loadChild(
				tx,
				actor,
				input.quota.childId,
				"change the limits",
			);
			const general =
				(await tx.repos.policies.listCurrent(child.id)).find(
					(policy) => policy.activityId === null,
				) ?? null;
			// What is not sent comes from the general quota, if there is one.
			await replacePolicy(
				tx,
				actor.parentId,
				child.id,
				id,
				resolveLimits(input.quota, general),
			);
		}
		return activity;
	});
}

export interface UpdateActivityInput {
	activityId: string;
	// Omitted fields stay as they are.
	name?: string;
	color?: string;
	icon?: string;
}

export async function updateActivity(
	deps: CoreDeps,
	actor: Actor,
	input: UpdateActivityInput,
): Promise<Activity> {
	requireParent(actor, "change the activities");
	const name = input.name === undefined ? undefined : activityName(input.name);
	const color =
		input.color === undefined ? undefined : activityColor(input.color);
	const icon = input.icon === undefined ? undefined : activityIcon(input.icon);
	return transaction(deps, async (tx) => {
		const activity = await loadActivity(tx, actor.familyId, input.activityId, {
			requireActive: false,
		});
		if (name !== undefined) {
			assertNameFree(
				name,
				await tx.repos.activities.listByFamily(actor.familyId),
				activity.id,
			);
		}
		const updated: Activity = {
			...activity,
			name: name ?? activity.name,
			color: color ?? activity.color,
			icon: icon ?? activity.icon,
		};
		await tx.repos.activities.update(updated);
		return updated;
	});
}

function inUse(activityId: string, reason: "session" | "request") {
	return new DomainError(
		"activity_in_use",
		reason === "session"
			? "A session of the activity is open"
			: "A request for the activity is waiting",
		{ activityId, reason },
	);
}

// Nothing may be running, scheduled or waiting on the activity.
async function assertNotInUse(tx: Tx, activity: Activity): Promise<void> {
	for (const child of await tx.repos.children.listByFamily(activity.familyId)) {
		const open = await tx.repos.sessions.findOpenByChild(child.id);
		if (open?.activityId === activity.id) {
			throw inUse(activity.id, "session");
		}
	}
	const pending = await tx.repos.requests.listPendingByFamily(
		activity.familyId,
	);
	if (pending.some((request) => request.activityId === activity.id)) {
		throw inUse(activity.id, "request");
	}
}

// The activity can no longer be used. Its own quotas close (they stay in the
// history), and what it used this week stops counting in the general quota.
// Doing it twice changes nothing.
export async function deactivateActivity(
	deps: CoreDeps,
	actor: Actor,
	input: { activityId: string },
): Promise<Activity> {
	requireParent(actor, "change the activities");
	return transaction(deps, async (tx) => {
		const activity = await loadActivity(tx, actor.familyId, input.activityId, {
			requireActive: false,
		});
		if (!activity.isActive) {
			return activity;
		}
		const activities = await tx.repos.activities.listByFamily(actor.familyId);
		if (activities.filter((other) => other.isActive).length <= 1) {
			throw new DomainError(
				"last_active_activity",
				"The family needs at least one active activity",
				{ activityId: activity.id },
			);
		}
		await assertNotInUse(tx, activity);
		const updated: Activity = { ...activity, isActive: false };
		await tx.repos.activities.update(updated);
		for (const child of await tx.repos.children.listByFamily(actor.familyId)) {
			await tx.repos.policies.closeCurrent(child.id, activity.id, tx.now);
			await settleGeneral(tx, actor.parentId, child);
		}
		return updated;
	});
}

// The activity can be used again: it shares a child's general quota if there
// is one, or waits for a quota of its own. Doing it twice changes nothing.
export async function activateActivity(
	deps: CoreDeps,
	actor: Actor,
	input: { activityId: string },
): Promise<Activity> {
	requireParent(actor, "change the activities");
	return transaction(deps, async (tx) => {
		const activity = await loadActivity(tx, actor.familyId, input.activityId, {
			requireActive: false,
		});
		if (activity.isActive) {
			return activity;
		}
		assertRoomForActive(await tx.repos.activities.listByFamily(actor.familyId));
		const updated: Activity = { ...activity, isActive: true };
		await tx.repos.activities.update(updated);
		return updated;
	});
}
