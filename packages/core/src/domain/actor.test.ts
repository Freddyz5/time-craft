import { describe, expect, test } from "bun:test";
import {
	type ChildActor,
	type ParentActor,
	requireChild,
	requireChildAccess,
	requireParent,
} from "./actor";

const parent: ParentActor = {
	kind: "parent",
	parentId: "mom",
	familyId: "home",
};
const child: ChildActor = { kind: "child", childId: "mateo", familyId: "home" };
const mateo = { id: "mateo", familyId: "home" };

describe("actor checks", () => {
	test("parent-only and child-only actions", () => {
		expect(() => requireParent(parent, "approve")).not.toThrow();
		expect(() => requireParent(child, "approve")).toThrow(
			expect.objectContaining({ code: "forbidden" }),
		);
		expect(() => requireChild(child, "ask")).not.toThrow();
		expect(() => requireChild(parent, "ask")).toThrow(
			expect.objectContaining({ code: "forbidden" }),
		);
	});

	test("parents see every child of their family; a child sees themselves", () => {
		expect(() => requireChildAccess(parent, mateo, "read")).not.toThrow();
		expect(() => requireChildAccess(child, mateo, "read")).not.toThrow();
		expect(() =>
			requireChildAccess({ ...child, childId: "sibling" }, mateo, "read"),
		).toThrow(expect.objectContaining({ code: "forbidden" }));
	});

	test("another family's child does not exist for the actor", () => {
		expect(() =>
			requireChildAccess({ ...parent, familyId: "other" }, mateo, "read"),
		).toThrow(expect.objectContaining({ code: "child_not_found" }));
	});
});
