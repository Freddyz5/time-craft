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

beforeEach(() => {
	kit = createTestKit(NOW);
	h = seedHousehold(kit, { policy: { warningMinutes: 10 } });
});

const computer = {
	name: "Computadora",
	color: "violet",
	icon: "monitor",
} as const;

// [activity, daily limit] of each current policy; "general" for the general
// quota.
async function layout() {
	return (await kit.core.listCurrentPolicies(h.mom, { childId: h.childId }))
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

const split = () =>
	kit.core.setQuotaLayout(h.mom, {
		childId: h.childId,
		general: null,
		own: [
			{ activityId: h.gameId, dailyLimitMinutes: 40, weeklyLimitMinutes: 200 },
			{ activityId: h.tvId, dailyLimitMinutes: 20, weeklyLimitMinutes: 100 },
		],
	});

describe("createActivity", () => {
	test("a new activity shares the general quota", async () => {
		const activity = await kit.core.createActivity(h.dad, computer);
		expect(activity).toMatchObject({
			familyId: h.familyId,
			name: "Computadora",
			color: "violet",
			icon: "monitor",
			isActive: true,
		});
		expect(activity.code).toStartWith("custom-");
		expect(await layout()).toEqual([["general", 60]]);
		const session = await kit.core.startDirectSession(h.mom, {
			childId: h.childId,
			activityId: activity.id,
			minutes: 20,
		});
		expect(session.status).toBe("running");
	});

	test("with a quota of its own for the child, in the same step", async () => {
		const activity = await kit.core.createActivity(h.dad, {
			...computer,
			quota: {
				childId: h.childId,
				dailyLimitMinutes: 30,
				weeklyLimitMinutes: 90,
			},
		});
		expect(await layout()).toEqual(
			expect.arrayContaining([
				[activity.id, 30],
				["general", 60],
			]),
		);
		expect(await layout()).toHaveLength(2);
		// What is not sent comes from the general quota.
		const own = (
			await kit.core.listCurrentPolicies(h.mom, { childId: h.childId })
		).find((policy) => policy.activityId === activity.id);
		expect(own?.warningMinutes).toBe(10);
	});

	test("without a general quota and without its own, it cannot be used yet", async () => {
		await split();
		const activity = await kit.core.createActivity(h.dad, computer);
		await expect(
			kit.core.startDirectSession(h.mom, {
				childId: h.childId,
				activityId: activity.id,
				minutes: 20,
			}),
		).rejects.toMatchObject({ code: "no_active_policy" });
	});

	test("names are unique in the family, without case or accents", async () => {
		await kit.core.createActivity(h.dad, computer);
		for (const name of ["computadora", "Computadóra", " TV "]) {
			await expect(
				kit.core.createActivity(h.dad, { ...computer, name }),
			).rejects.toMatchObject({ code: "activity_name_taken" });
		}
	});

	test("colour, icon and name come from the lists and limits", async () => {
		for (const [input, field] of [
			[{ ...computer, color: "green" }, "color"],
			[{ ...computer, icon: "rocket" }, "icon"],
			[{ ...computer, name: " " }, "name"],
			[{ ...computer, name: "x".repeat(31) }, "name"],
		] as const) {
			await expect(kit.core.createActivity(h.dad, input)).rejects.toMatchObject(
				{ code: "invalid_input", details: { field } },
			);
		}
	});

	test("at most six active activities", async () => {
		for (const name of ["Tablet", "Celular", "Consola", "Películas"]) {
			await kit.core.createActivity(h.dad, { ...computer, name });
		}
		await expect(
			kit.core.createActivity(h.dad, computer),
		).rejects.toMatchObject({ code: "activity_limit_reached" });
	});

	test("only parents", async () => {
		await expect(
			kit.core.createActivity(h.child, computer),
		).rejects.toMatchObject({ code: "forbidden" });
	});
});

describe("updateActivity", () => {
	test("Juego and TV can be renamed and recoloured too", async () => {
		const updated = await kit.core.updateActivity(h.mom, {
			activityId: h.gameId,
			name: "Minecraft",
			color: "sky",
		});
		expect(updated).toMatchObject({
			name: "Minecraft",
			color: "sky",
			icon: null,
			code: "game",
		});
		await expect(
			kit.core.updateActivity(h.mom, { activityId: h.tvId, name: "minecraft" }),
		).rejects.toMatchObject({ code: "activity_name_taken" });
		// Its own name, as it was, is not taken.
		await kit.core.updateActivity(h.mom, { activityId: h.tvId, name: "TV" });
	});

	test("another family's activity does not exist", async () => {
		const other = seedHousehold(kit, { prefix: "other-" });
		await expect(
			kit.core.updateActivity(h.mom, { activityId: other.tvId, name: "X" }),
		).rejects.toMatchObject({ code: "activity_not_found" });
	});
});

describe("deactivateActivity", () => {
	test("the general quota keeps the others when two are left", async () => {
		const pc = await kit.core.createActivity(h.dad, computer);
		await kit.core.deactivateActivity(h.mom, { activityId: pc.id });
		expect(await layout()).toEqual([["general", 60]]);
		await expect(
			kit.core.startDirectSession(h.mom, {
				childId: h.childId,
				activityId: pc.id,
				minutes: 10,
			}),
		).rejects.toMatchObject({ code: "activity_inactive" });
	});

	test("left with one activity, the general quota becomes its own", async () => {
		await kit.core.deactivateActivity(h.mom, { activityId: h.tvId });
		expect(await layout()).toEqual([[h.gameId, 60]]);
	});

	test("its own quota closes and stays in the history", async () => {
		await split();
		const pc = await kit.core.createActivity(h.dad, {
			...computer,
			quota: {
				childId: h.childId,
				dailyLimitMinutes: 30,
				weeklyLimitMinutes: 90,
			},
		});
		await kit.core.deactivateActivity(h.mom, { activityId: pc.id });
		expect(await layout()).toEqual([
			[h.gameId, 40],
			[h.tvId, 20],
		]);
		const history = await kit.core.listPolicyHistory(h.mom, {
			childId: h.childId,
		});
		expect(
			history.find((policy) => policy.activityId === pc.id)?.validTo,
		).not.toBeNull();
	});

	test("what it used this week stops counting in the general quota", async () => {
		const pcId = addActivity(kit, h);
		kit.db.set("sessions", {
			...finishedSession("2026-10-21T10:00:00-05:00", 30, {
				activityId: pcId,
			}),
			childId: h.childId,
		});
		expect(await availableByBag()).toEqual({ general: 30 });
		await kit.core.deactivateActivity(h.mom, { activityId: pcId });
		expect(await availableByBag()).toEqual({ general: 60 });
	});

	test("not while a session or a request of it is open", async () => {
		const session = await kit.core.startDirectSession(h.mom, {
			childId: h.childId,
			activityId: h.tvId,
			minutes: 10,
		});
		await expect(
			kit.core.deactivateActivity(h.mom, { activityId: h.tvId }),
		).rejects.toMatchObject({
			code: "activity_in_use",
			details: { reason: "session" },
		});
		await kit.core.stopSession(h.mom, { sessionId: session.id });
		await kit.core.createRequest(h.child, {
			requestType: "start",
			activityId: h.tvId,
			requestedMinutes: 10,
		});
		await expect(
			kit.core.deactivateActivity(h.mom, { activityId: h.tvId }),
		).rejects.toMatchObject({
			code: "activity_in_use",
			details: { reason: "request" },
		});
	});

	test("the family keeps at least one active activity", async () => {
		await kit.core.deactivateActivity(h.mom, { activityId: h.tvId });
		await expect(
			kit.core.deactivateActivity(h.mom, { activityId: h.gameId }),
		).rejects.toMatchObject({ code: "last_active_activity" });
	});

	test("only parents", async () => {
		await expect(
			kit.core.deactivateActivity(h.child, { activityId: h.tvId }),
		).rejects.toMatchObject({ code: "forbidden" });
	});
});

describe("activateActivity", () => {
	test("it shares the general quota again", async () => {
		const pc = await kit.core.createActivity(h.dad, computer);
		await kit.core.deactivateActivity(h.mom, { activityId: pc.id });
		const again = await kit.core.activateActivity(h.mom, {
			activityId: pc.id,
		});
		expect(again.isActive).toBe(true);
		const session = await kit.core.startDirectSession(h.mom, {
			childId: h.childId,
			activityId: pc.id,
			minutes: 10,
		});
		expect(session.status).toBe("running");
	});

	test("at most six active activities", async () => {
		const extra = await kit.core.createActivity(h.dad, computer);
		await kit.core.deactivateActivity(h.mom, { activityId: extra.id });
		for (const name of ["Tablet", "Celular", "Consola", "Películas"]) {
			await kit.core.createActivity(h.dad, { ...computer, name });
		}
		await expect(
			kit.core.activateActivity(h.mom, { activityId: extra.id }),
		).rejects.toMatchObject({ code: "activity_limit_reached" });
	});
});
