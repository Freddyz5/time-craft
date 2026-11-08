import { beforeEach, describe, expect, test } from "bun:test";
import {
	addActivity,
	createTestKit,
	type Household,
	seedHousehold,
	type TestKit,
} from "../testing";
import { finishedSession } from "../testing/builders";

const NOW = "2026-10-21T15:00:00-05:00";

let kit: TestKit;
let h: Household;

const current = () =>
	kit.core.listCurrentPolicies(h.mom, { childId: h.childId });

// [activity, daily limit] of each current policy; "general" for the general
// quota.
async function layout() {
	return (await current())
		.map((policy) => [policy.activityId ?? "general", policy.dailyLimitMinutes])
		.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

async function availableByBag() {
	const view = await kit.core.getChildBalance(h.mom, { childId: h.childId });
	return Object.fromEntries(
		view.balances.map((balance) => [
			balance.activityId ?? "general",
			balance.availableSeconds / 60,
		]),
	);
}

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
		// With a third activity, Juego and Computadora keep sharing the general
		// quota.
		addActivity(kit, h);
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
		// TV: 30 − 25. Game draws from the general bag: 60 − 40.
		expect(await availableByBag()).toEqual({ [h.tvId]: 5, general: 20 });

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

	test("left with one activity, the general quota becomes its own", async () => {
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			activityId: h.tvId,
			dailyLimitMinutes: 30,
			weeklyLimitMinutes: 120,
		});
		const policies = await current();
		expect(await layout()).toEqual([
			[h.gameId, 60],
			[h.tvId, 30],
		]);
		// Game keeps every limit the general quota had.
		expect(
			policies.find((policy) => policy.activityId === h.gameId),
		).toMatchObject({
			weeklyLimitMinutes: 300,
			weeklyBonusCapMinutes: 30,
			warningMinutes: 10,
			validFrom: new Date("2026-10-21T20:00:00.000Z"),
			createdByParentId: h.mom.parentId,
		});
		// The general quota stays in the history.
		const general = kit.db.get("policies", "policy-global");
		expect(general.validTo?.toISOString()).toBe("2026-10-21T20:00:00.000Z");

		kit.db.set("sessions", {
			...finishedSession("2026-10-21T11:00:00-05:00", 40, {
				activityId: h.gameId,
			}),
			childId: h.childId,
		});
		expect(await availableByBag()).toEqual({ [h.gameId]: 20, [h.tvId]: 30 });
	});

	test("the general quota needs two activities drawing from it", async () => {
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			activityId: h.tvId,
			dailyLimitMinutes: 30,
			weeklyLimitMinutes: 120,
		});
		await expect(
			kit.core.setPolicy(h.mom, {
				childId: h.childId,
				dailyLimitMinutes: 60,
				weeklyLimitMinutes: 300,
			}),
		).rejects.toMatchObject({
			code: "general_needs_two_activities",
			details: { activityIds: [] },
		});

		// An inactive activity does not count.
		addActivity(kit, h, { isActive: false });
		await expect(
			kit.core.setPolicy(h.mom, {
				childId: h.childId,
				dailyLimitMinutes: 60,
				weeklyLimitMinutes: 300,
			}),
		).rejects.toMatchObject({ code: "general_needs_two_activities" });
	});

	test("a general quota from before the rule, left with no activity, closes", async () => {
		// TV already had its own quota, so only Game drew from the general one.
		kit.db.set("policies", {
			...kit.db.get("policies", "policy-global"),
			id: "policy-tv",
			activityId: h.tvId,
		});
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			activityId: h.gameId,
			dailyLimitMinutes: 45,
			weeklyLimitMinutes: 200,
		});
		expect(await layout()).toEqual([
			[h.gameId, 45],
			[h.tvId, 60],
		]);
	});
});

describe("setQuotaLayout", () => {
	test("splits the general quota between two activities in one step", async () => {
		const policies = await kit.core.setQuotaLayout(h.mom, {
			childId: h.childId,
			general: null,
			own: [
				// More than the general quota had: the total can grow.
				{
					activityId: h.gameId,
					dailyLimitMinutes: 45,
					weeklyLimitMinutes: 200,
				},
				{
					activityId: h.tvId,
					dailyLimitMinutes: 45,
					weeklyLimitMinutes: 200,
					warningMinutes: 3,
				},
			],
		});
		expect(policies).toHaveLength(2);
		expect(await layout()).toEqual([
			[h.gameId, 45],
			[h.tvId, 45],
		]);
		// What is not sent comes from the general quota.
		expect(
			policies.find((policy) => policy.activityId === h.gameId),
		).toMatchObject({ weeklyBonusCapMinutes: 30, warningMinutes: 10 });
		expect(
			policies.find((policy) => policy.activityId === h.tvId),
		).toMatchObject({ weeklyBonusCapMinutes: 30, warningMinutes: 3 });
		expect(kit.db.get("policies", "policy-global").validTo).not.toBeNull();
	});

	test("joins activities back into a general quota", async () => {
		await kit.core.setQuotaLayout(h.mom, {
			childId: h.childId,
			general: null,
			own: [
				{
					activityId: h.gameId,
					dailyLimitMinutes: 30,
					weeklyLimitMinutes: 150,
				},
				{ activityId: h.tvId, dailyLimitMinutes: 30, weeklyLimitMinutes: 150 },
			],
		});
		kit.clock.advanceMinutes(5);
		await kit.core.setQuotaLayout(h.dad, {
			childId: h.childId,
			general: { dailyLimitMinutes: 90, weeklyLimitMinutes: 400 },
			own: [],
		});
		expect(await layout()).toEqual([["general", 90]]);
		expect((await current())[0]).toMatchObject({
			// From one of the quotas it joins.
			weeklyBonusCapMinutes: 30,
			createdByParentId: h.dad.parentId,
		});
		expect(Object.keys(await availableByBag())).toEqual(["general"]);
	});

	test("a third activity keeps sharing the general quota", async () => {
		addActivity(kit, h);
		await kit.core.setQuotaLayout(h.mom, {
			childId: h.childId,
			general: { dailyLimitMinutes: 60, weeklyLimitMinutes: 300 },
			own: [
				{ activityId: h.tvId, dailyLimitMinutes: 30, weeklyLimitMinutes: 120 },
			],
		});
		expect(await layout()).toEqual([
			[h.tvId, 30],
			["general", 60],
		]);
		const view = await kit.core.getChildBalance(h.mom, { childId: h.childId });
		expect(view.balances).toHaveLength(2);
	});

	test("only the quotas that change get a new policy", async () => {
		const split = {
			childId: h.childId,
			general: null,
			own: [
				{
					activityId: h.gameId,
					dailyLimitMinutes: 30,
					weeklyLimitMinutes: 150,
				},
				{ activityId: h.tvId, dailyLimitMinutes: 30, weeklyLimitMinutes: 150 },
			],
		};
		await kit.core.setQuotaLayout(h.mom, split);
		expect(kit.db.all("policies")).toHaveLength(3);
		await kit.core.setQuotaLayout(h.mom, split);
		expect(kit.db.all("policies")).toHaveLength(3);
		await kit.core.setQuotaLayout(h.mom, {
			...split,
			own: [
				{
					activityId: h.gameId,
					dailyLimitMinutes: 30,
					weeklyLimitMinutes: 150,
				},
				{ activityId: h.tvId, dailyLimitMinutes: 40, weeklyLimitMinutes: 150 },
			],
		});
		expect(kit.db.all("policies")).toHaveLength(4);
	});

	test("the general quota needs two activities; nothing is saved otherwise", async () => {
		await expect(
			kit.core.setQuotaLayout(h.mom, {
				childId: h.childId,
				general: { dailyLimitMinutes: 60, weeklyLimitMinutes: 300 },
				own: [
					{
						activityId: h.tvId,
						dailyLimitMinutes: 30,
						weeklyLimitMinutes: 120,
					},
				],
			}),
		).rejects.toMatchObject({
			code: "general_needs_two_activities",
			details: { activityIds: [h.gameId] },
		});
		expect(await layout()).toEqual([["general", 60]]);
	});

	test("every active activity needs a quota", async () => {
		await expect(
			kit.core.setQuotaLayout(h.mom, {
				childId: h.childId,
				general: null,
				own: [
					{
						activityId: h.tvId,
						dailyLimitMinutes: 30,
						weeklyLimitMinutes: 120,
					},
				],
			}),
		).rejects.toMatchObject({
			code: "activities_without_quota",
			details: { activityIds: [h.gameId] },
		});
	});

	test("checks each activity and the limits before saving anything", async () => {
		const own = (activityId: string) => ({
			activityId,
			dailyLimitMinutes: 30,
			weeklyLimitMinutes: 120,
		});
		const other = seedHousehold(kit, { prefix: "other-" });
		const inactive = addActivity(kit, h, { isActive: false });
		const cases: [Parameters<typeof kit.core.setQuotaLayout>[1], string][] = [
			[
				{
					childId: h.childId,
					general: null,
					own: [own(h.gameId), own(h.gameId)],
				},
				"invalid_input",
			],
			[
				{
					childId: h.childId,
					general: null,
					own: [own(h.gameId), own(h.tvId), own(other.tvId)],
				},
				"activity_not_found",
			],
			[
				{
					childId: h.childId,
					general: null,
					own: [own(h.gameId), own(h.tvId), own(inactive)],
				},
				"activity_inactive",
			],
			[
				{
					childId: h.childId,
					general: null,
					own: [
						own(h.gameId),
						{
							activityId: h.tvId,
							dailyLimitMinutes: 90,
							weeklyLimitMinutes: 60,
						},
					],
				},
				"invalid_input",
			],
		];
		for (const [input, code] of cases) {
			await expect(kit.core.setQuotaLayout(h.mom, input)).rejects.toMatchObject(
				{
					code,
				},
			);
		}
		expect(await layout()).toEqual([["general", 60]]);
	});

	test("only parents", async () => {
		await expect(
			kit.core.setQuotaLayout(h.child, {
				childId: h.childId,
				general: null,
				own: [
					{
						activityId: h.gameId,
						dailyLimitMinutes: 600,
						weeklyLimitMinutes: 3000,
					},
					{
						activityId: h.tvId,
						dailyLimitMinutes: 600,
						weeklyLimitMinutes: 3000,
					},
				],
			}),
		).rejects.toMatchObject({ code: "forbidden" });
	});
});

describe("listQuotas", () => {
	test("adds up every quota, day by day and for the week", async () => {
		addActivity(kit, h);
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			activityId: h.tvId,
			dailyLimitMinutes: 30,
			weeklyLimitMinutes: 60,
			allowedDays: [0, 6],
		});
		for (const actor of [h.dad, h.child]) {
			const { policies, totals } = await kit.core.listQuotas(actor, {
				childId: h.childId,
			});
			expect(policies).toHaveLength(2);
			expect(totals).toEqual({
				dailyMinutesByDay: [90, 60, 60, 60, 60, 60, 90],
				weeklyMinutes: 360,
			});
		}
	});

	test("an inactive activity's own quota does not count", async () => {
		const pcId = addActivity(kit, h);
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			activityId: pcId,
			dailyLimitMinutes: 30,
			weeklyLimitMinutes: 60,
		});
		kit.db.set("activities", {
			...kit.db.get("activities", pcId),
			isActive: false,
		});
		const { totals } = await kit.core.listQuotas(h.mom, { childId: h.childId });
		expect(totals.weeklyMinutes).toBe(300);
	});
});

describe("listCurrentPolicies", () => {
	test("parents and the child see the limits in force", async () => {
		addActivity(kit, h);
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

describe("listPolicyHistory", () => {
	test("keeps the closed policies, newest first, for parents and the child", async () => {
		addActivity(kit, h);
		kit.clock.set("2026-10-21T16:00:00-05:00");
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			dailyLimitMinutes: 90,
			weeklyLimitMinutes: 400,
		});
		kit.clock.set("2026-10-21T17:00:00-05:00");
		await kit.core.setPolicy(h.dad, {
			childId: h.childId,
			activityId: h.tvId,
			dailyLimitMinutes: 30,
			weeklyLimitMinutes: 120,
		});
		for (const actor of [h.mom, h.child]) {
			const history = await kit.core.listPolicyHistory(actor, {
				childId: h.childId,
			});
			expect(
				history.map((policy) => [
					policy.activityId,
					policy.dailyLimitMinutes,
					policy.validTo === null,
				]),
			).toEqual([
				[h.tvId, 30, true],
				[null, 90, true],
				[null, 60, false],
			]);
		}
	});

	test("another family's child does not exist", async () => {
		const other = seedHousehold(kit, { prefix: "other-" });
		await expect(
			kit.core.listPolicyHistory(other.dad, { childId: h.childId }),
		).rejects.toMatchObject({ code: "child_not_found" });
	});
});

describe("clearActivityPolicy", () => {
	test("the activity goes back to the general quota; the history keeps it", async () => {
		addActivity(kit, h);
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			activityId: h.tvId,
			dailyLimitMinutes: 30,
			weeklyLimitMinutes: 120,
		});
		kit.clock.advanceMinutes(5);
		const closed = await kit.core.clearActivityPolicy(h.dad, {
			childId: h.childId,
			activityId: h.tvId,
		});
		expect(closed?.validTo?.toISOString()).toBe("2026-10-21T20:05:00.000Z");

		const current = await kit.core.listCurrentPolicies(h.mom, {
			childId: h.childId,
		});
		expect(current.map((policy) => policy.activityId)).toEqual([null]);
		const view = await kit.core.getChildBalance(h.mom, { childId: h.childId });
		expect(view.balances.map((balance) => balance.activityId)).toEqual([null]);
		const history = await kit.core.listPolicyHistory(h.mom, {
			childId: h.childId,
		});
		expect(history).toHaveLength(2);

		// Nothing left to clear.
		expect(
			await kit.core.clearActivityPolicy(h.mom, {
				childId: h.childId,
				activityId: h.tvId,
			}),
		).toBeNull();
	});

	test("with no general quota to go back to, it says so", async () => {
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			activityId: h.tvId,
			dailyLimitMinutes: 30,
			weeklyLimitMinutes: 120,
		});
		await expect(
			kit.core.clearActivityPolicy(h.mom, {
				childId: h.childId,
				activityId: h.tvId,
			}),
		).rejects.toMatchObject({
			code: "no_general_quota",
			details: { activityId: h.tvId },
		});
		expect(await layout()).toEqual([
			[h.gameId, 60],
			[h.tvId, 30],
		]);
	});

	test("only parents, and only for an activity of the family", async () => {
		await expect(
			kit.core.clearActivityPolicy(h.child, {
				childId: h.childId,
				activityId: h.tvId,
			}),
		).rejects.toMatchObject({ code: "forbidden" });
		const other = seedHousehold(kit, { prefix: "other-" });
		await expect(
			kit.core.clearActivityPolicy(h.mom, {
				childId: h.childId,
				activityId: other.tvId,
			}),
		).rejects.toMatchObject({ code: "activity_not_found" });
	});
});

describe("getChildBalance: total", () => {
	test("adds up what every bag has left today", async () => {
		await kit.core.setQuotaLayout(h.mom, {
			childId: h.childId,
			general: null,
			own: [
				{
					activityId: h.gameId,
					dailyLimitMinutes: 60,
					weeklyLimitMinutes: 300,
				},
				{ activityId: h.tvId, dailyLimitMinutes: 30, weeklyLimitMinutes: 120 },
			],
		});
		kit.db.set("sessions", {
			...finishedSession("2026-10-21T11:00:00-05:00", 40, {
				activityId: h.gameId,
			}),
			childId: h.childId,
		});
		const view = await kit.core.getChildBalance(h.child, {
			childId: h.childId,
		});
		// Game: 60 − 40; TV: 30.
		expect(view.totalAvailableSeconds / 60).toBe(50);
	});
});
