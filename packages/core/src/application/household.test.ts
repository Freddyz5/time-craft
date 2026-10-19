import { beforeEach, describe, expect, test } from "bun:test";
import {
	createTestKit,
	type Household,
	seedHousehold,
	type TestKit,
} from "../testing";

const NOW = "2026-10-21T15:00:00-05:00";

let kit: TestKit;
let h: Household;

beforeEach(() => {
	kit = createTestKit(NOW);
	h = seedHousehold(kit);
	// Another family in the same database must never show up.
	seedHousehold(kit, { prefix: "other-" });
});

describe("getHousehold", () => {
	test("a parent sees the whole family, inactive activities included", async () => {
		kit.db.set("activities", {
			...kit.db.get("activities", h.tvId),
			isActive: false,
		});
		await kit.core.regenerateRecoveryCode(h.mom);

		const view = await kit.core.getHousehold(h.dad);

		expect(view.me).toEqual({
			kind: "parent",
			parentId: h.dad.parentId,
			name: "Papá",
		});
		expect(view.family).toMatchObject({
			id: h.familyId,
			timezone: "America/Guayaquil",
			weekStartDay: 1,
			recoveryCodeCreatedAt: new Date(NOW),
		});
		expect(view.parents.map((parent) => parent.name).sort()).toEqual([
			"Mamá",
			"Papá",
		]);
		expect(view.children).toEqual([
			{ id: h.childId, name: "Mateo", avatar: null, lockedUntil: null },
		]);
		expect(view.activities.map((activity) => activity.code)).toEqual([
			"game",
			"tv",
		]);
	});

	test("the child sees themselves and only the active activities", async () => {
		kit.db.set("activities", {
			...kit.db.get("activities", h.tvId),
			isActive: false,
		});
		kit.db.set("children", {
			...kit.db.get("children", h.childId),
			id: "sibling",
			authUserId: "auth-sibling",
			name: "Lucía",
		});

		const view = await kit.core.getHousehold(h.child);

		expect(view.me).toEqual({
			kind: "child",
			childId: h.childId,
			name: "Mateo",
			avatar: null,
		});
		expect(view.children.map((child) => child.id)).toEqual([h.childId]);
		expect(view.activities.map((activity) => activity.code)).toEqual(["game"]);
		expect(view.family.recoveryCodeCreatedAt).toBeNull();
	});
});
