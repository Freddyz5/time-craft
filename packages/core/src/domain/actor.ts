// The person calling a use case, already authenticated by the api. Parents
// manage everything in their family; the child only reads, asks, cancels their
// own pending request and reports tasks.
import { DomainError, forbidden } from "../errors";

export interface ParentActor {
	kind: "parent";
	parentId: string;
	familyId: string;
}

export interface ChildActor {
	kind: "child";
	childId: string;
	familyId: string;
}

export type Actor = ParentActor | ChildActor;

export function requireParent(
	actor: Actor,
	action: string,
): asserts actor is ParentActor {
	if (actor.kind !== "parent") {
		throw forbidden(action);
	}
}

export function requireChild(
	actor: Actor,
	action: string,
): asserts actor is ChildActor {
	if (actor.kind !== "child") {
		throw forbidden(action);
	}
}

// Anything outside the actor's family does not exist for them: answering
// "forbidden" would confirm that the id is real.
export function requireSameFamily(
	actor: Actor,
	familyId: string,
	notFound: DomainError,
): void {
	if (actor.familyId !== familyId) {
		throw notFound;
	}
}

// Parents of the family see every child; a child only sees themselves.
export function requireChildAccess(
	actor: Actor,
	child: { id: string; familyId: string },
	action: string,
): void {
	requireSameFamily(
		actor,
		child.familyId,
		new DomainError("child_not_found", "Child not found"),
	);
	if (actor.kind === "child" && actor.childId !== child.id) {
		throw forbidden(action);
	}
}
