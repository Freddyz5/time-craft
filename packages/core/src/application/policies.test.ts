import { beforeEach, describe, expect, test } from "bun:test";
import {
	createTestKit,
	type Household,
	seedHousehold,
	type TestKit,
} from "../testing";
import { finishedSession } from "../testing/builders";

const NOW = "2026-10-21T15:00:00-05:00";

let kit: TestKit;
let h: Household;

beforeEach(() => {
	kit = createTestKit(NOW);
	h = seedHousehold(kit, {
		policy: { weeklyBonusCapMinutes: 30, warningMinutes: 10 },
	});
});

describe("setPolicy", () => {
	test("closes the current policy and creates another; history stays", async () => {
		const policy = await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			dailyLimitMinutes: 90,
			weeklyLimitMinutes: 400,
		});
		expect(policy).toMatchObject({
			activityId: null,
			dailyLimitMinutes: 90,
			weeklyLimitMinutes: 400,
			// Kept from the policy it replaces.
			weeklyBonusCapMinutes: 30,
			warningMinutes: 10,
			validTo: null,
			createdByParentId: h.mom.parentId,
		});
		const old = kit.db.get("policies", "policy-global");
		expect(old.validTo?.toISOString()).toBe("2026-10-21T20:00:00.000Z");
		expect(kit.db.all("policies")).toHaveLength(2);
	});

	test("the new limits apply to the whole current week", async () => {
		kit.db.set("sessions", {
			...finishedSession("2026-10-19T15:00:00-05:00", 60),
			childId: h.childId,
		});
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			dailyLimitMinutes: 60,
			weeklyLimitMinutes: 80,
		});
		const view = await kit.core.getChildBalance(h.mom, { childId: h.childId });
		expect((view.balances[0]?.availableSeconds ?? 0) / 60).toBe(20);
	});

	test("the weekly limit cannot be below the daily one", async () => {
		await expect(
			kit.core.setPolicy(h.mom, {
				childId: h.childId,
				dailyLimitMinutes: 90,
				weeklyLimitMinutes: 60,
			}),
		).rejects.toMatchObject({
			code: "invalid_input",
			details: { field: "weeklyLimitMinutes" },
		});
	});

	test("the child cannot change limits", async () => {
		await expect(
			kit.core.setPolicy(h.child, {
				childId: h.childId,
				dailyLimitMinutes: 600,
				weeklyLimitMinutes: 3000,
			}),
		).rejects.toMatchObject({ code: "forbidden" });
	});

	test("a policy per activity is a separate bag", async () => {
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			activityId: h.tvId,
			dailyLimitMinutes: 30,
			weeklyLimitMinutes: 120,
		});
		kit.db.set("sessions", {
			...finishedSession("2026-10-21T10:00:00-05:00", 25, {
				activityId: h.tvId,
			}),
			childId: h.childId,
		});
		kit.db.set("sessions", {
			...finishedSession("2026-10-21T11:00:00-05:00", 40, {
				activityId: h.gameId,
			}),
			childId: h.childId,
		});
		const view = await kit.core.getChildBalance(h.mom, { childId: h.childId });
		const byBag = Object.fromEntries(
			view.balances.map((balance) => [
				balance.activityId ?? "global",
				balance.availableSeconds / 60,
			]),
		);
		// TV: 30 − 25. Game draws from the global bag: 60 − 40.
		expect(byBag).toEqual({ [h.tvId]: 5, global: 20 });

		await expect(
			kit.core.startDirectSession(h.mom, {
				childId: h.childId,
				activityId: h.tvId,
				minutes: 10,
			}),
		).rejects.toMatchObject({
			code: "exceeds_available",
			details: { availableSeconds: 300 },
		});
	});
});

describe("listCurrentPolicies", () => {
	test("parents and the child see the limits in force", async () => {
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			activityId: h.tvId,
			dailyLimitMinutes: 30,
			weeklyLimitMinutes: 120,
		});
		for (const actor of [h.dad, h.child]) {
			const policies = await kit.core.listCurrentPolicies(actor, {
				childId: h.childId,
			});
			expect(
				policies.map((policy) => [policy.activityId, policy.dailyLimitMinutes]),
			).toEqual(
				expect.arrayContaining([
					[null, 60],
					[h.tvId, 30],
				]),
			);
			expect(policies).toHaveLength(2);
		}
	});

	test("another family's child does not exist", async () => {
		const other = seedHousehold(kit, { prefix: "other-" });
		await expect(
			kit.core.listCurrentPolicies(other.dad, { childId: h.childId }),
		).rejects.toMatchObject({ code: "child_not_found" });
	});
});
