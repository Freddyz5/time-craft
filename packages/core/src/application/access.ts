// Loading aggregates on behalf of an actor. Whatever belongs to another family
// is reported as not found.
import {
	type Actor,
	requireChildAccess,
	requireSameFamily,
} from "../domain/actor";
import type { BonusTask } from "../domain/bonus";
import type { Activity, Child, Family } from "../domain/family";
import type { Session } from "../domain/session";
import { DomainError } from "../errors";
import type { Tx } from "./context";

export async function loadFamily(tx: Tx, familyId: string): Promise<Family> {
	const family = await tx.repos.families.findById(familyId);
	if (family === null) {
		throw new DomainError("family_not_found", "Family not found");
	}
	return family;
}

// The child, if the actor may see them (a parent of the family, or the child).
export async function loadChild(
	tx: Tx,
	actor: Actor,
	childId: string,
	action: string,
): Promise<Child> {
	const child = await tx.repos.children.findById(childId);
	if (child === null) {
		throw new DomainError("child_not_found", "Child not found");
	}
	requireChildAccess(actor, child, action);
	return child;
}

export async function loadChildById(tx: Tx, childId: string): Promise<Child> {
	const child = await tx.repos.children.findById(childId);
	if (child === null) {
		throw new DomainError("child_not_found", "Child not found");
	}
	return child;
}

export async function loadActivity(
	tx: Tx,
	familyId: string,
	activityId: string,
	options: { requireActive: boolean },
): Promise<Activity> {
	const activity = await tx.repos.activities.findById(activityId);
	if (activity === null || activity.familyId !== familyId) {
		throw new DomainError("activity_not_found", "Activity not found");
	}
	if (options.requireActive && !activity.isActive) {
		throw new DomainError("activity_inactive", "The activity is not active", {
			activityId,
		});
	}
	return activity;
}

export async function loadSession(
	tx: Tx,
	actor: Actor,
	sessionId: string,
	action: string,
): Promise<{ session: Session; child: Child }> {
	const session = await tx.repos.sessions.findById(sessionId);
	if (session === null) {
		throw new DomainError("session_not_found", "Session not found");
	}
	const child = await tx.repos.children.findById(session.childId);
	if (child === null || child.familyId !== actor.familyId) {
		throw new DomainError("session_not_found", "Session not found");
	}
	requireChildAccess(actor, child, action);
	return { session, child };
}

export async function loadBonusTask(
	tx: Tx,
	actor: Actor,
	taskId: string,
): Promise<BonusTask> {
	const task = await tx.repos.bonusTasks.findById(taskId);
	const notFound = new DomainError(
		"bonus_task_not_found",
		"Bonus task not found",
	);
	if (task === null) {
		throw notFound;
	}
	requireSameFamily(actor, task.familyId, notFound);
	return task;
}

export async function parentUserIds(
	tx: Tx,
	familyId: string,
): Promise<string[]> {
	const parents = await tx.repos.parents.listByFamily(familyId);
	return parents.map((parent) => parent.authUserId);
}
