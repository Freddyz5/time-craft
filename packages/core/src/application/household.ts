// Who is signed in and the household around them: what the web needs before
// anything else (names, ids, activities). A child sees only themselves among
// the children and only the active activities.
import type { Actor } from "../domain/actor";
import type { Activity, WeekDay } from "../domain/family";
import { DomainError } from "../errors";
import { loadFamily } from "./access";
import { type CoreDeps, transaction } from "./context";

export type Me =
	| { kind: "parent"; parentId: string; name: string }
	| { kind: "child"; childId: string; name: string; avatar: string | null };

export interface HouseholdChild {
	id: string;
	name: string;
	avatar: string | null;
	// Set while the child is locked out for wrong PINs (it may have passed).
	lockedUntil: Date | null;
}

export interface HouseholdView {
	me: Me;
	family: {
		id: string;
		name: string;
		timezone: string;
		weekStartDay: WeekDay;
		requestExpiryMinutes: number;
		autoCloseAfterMinutes: number;
		// When the current recovery code was generated; null if there is none.
		// Only for parents.
		recoveryCodeCreatedAt: Date | null;
	};
	parents: { id: string; name: string }[];
	children: HouseholdChild[];
	activities: Activity[];
}

export async function getHousehold(
	deps: CoreDeps,
	actor: Actor,
): Promise<HouseholdView> {
	return transaction(deps, async (tx) => {
		const family = await loadFamily(tx, actor.familyId);
		const parents = await tx.repos.parents.listByFamily(family.id);
		const children = await tx.repos.children.listByFamily(family.id);
		const activities = await tx.repos.activities.listByFamily(family.id);

		let me: Me;
		if (actor.kind === "parent") {
			const parent = parents.find((parent) => parent.id === actor.parentId);
			if (parent === undefined) {
				throw new DomainError("parent_not_found", "Parent not found");
			}
			me = { kind: "parent", parentId: parent.id, name: parent.name };
		} else {
			const child = children.find((child) => child.id === actor.childId);
			if (child === undefined) {
				throw new DomainError("child_not_found", "Child not found");
			}
			me = {
				kind: "child",
				childId: child.id,
				name: child.name,
				avatar: child.avatar,
			};
		}

		const isParent = actor.kind === "parent";
		const ownChildId = actor.kind === "child" ? actor.childId : null;
		return {
			me,
			family: {
				id: family.id,
				name: family.name,
				timezone: family.timezone,
				weekStartDay: family.weekStartDay,
				requestExpiryMinutes: family.requestExpiryMinutes,
				autoCloseAfterMinutes: family.autoCloseAfterMinutes,
				recoveryCodeCreatedAt: isParent ? family.recoveryCodeCreatedAt : null,
			},
			parents: parents.map((parent) => ({ id: parent.id, name: parent.name })),
			children: children
				.filter((child) => isParent || child.id === ownChildId)
				.map((child) => ({
					id: child.id,
					name: child.name,
					avatar: child.avatar,
					lockedUntil: child.lockedUntil,
				})),
			activities: activities.filter(
				(activity) => isParent || activity.isActive,
			),
		};
	});
}
