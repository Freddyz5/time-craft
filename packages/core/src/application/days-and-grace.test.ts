// Allowed days and the grace after the end, through the use cases.
import { beforeEach, describe, expect, test } from "bun:test";
import type { AlertType } from "../domain/alerts";
import type { WeekDay } from "../domain/family";
import {
	createTestKit,
	type Household,
	seedHousehold,
	type TestKit,
} from "../testing";

// Wednesday 21 Oct 2026, 15:00 in Guayaquil (UTC−5).
const NOW = "2026-10-21T15:00:00-05:00";
const WEEKEND: WeekDay[] = [0, 6];

let kit: TestKit;
let h: Household;

function seed(policy: { allowedDays?: WeekDay[]; graceMinutes?: number }) {
	kit = createTestKit(NOW);
	h = seedHousehold(kit, { policy });
}

async function available() {
	const view = await kit.core.getChildBalance(h.mom, { childId: h.childId });
	return (view.balances[0]?.availableSeconds ?? 0) / 60;
}

function alertOf(sessionId: string, type: AlertType) {
	const alert = kit.db
		.all("alerts")
		.find(
			(candidate) =>
				candidate.sessionId === sessionId && candidate.alertType === type,
		);
	if (alert === undefined) {
		throw new Error(`no ${type} alert`);
	}
	return alert;
}

describe("setPolicy: days and grace", () => {
	beforeEach(() => seed({ graceMinutes: 2 }));

	test("days are kept in order, once each", async () => {
		const policy = await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			dailyLimitMinutes: 60,
			weeklyLimitMinutes: 300,
			allowedDays: [6, 0, 3, 3],
		});
		expect(policy.allowedDays).toEqual([0, 3, 6]);
		// Omitted: kept from the policy it replaces.
		expect(policy.graceMinutes).toBe(2);
	});

	test("omitted days keep the current ones", async () => {
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			dailyLimitMinutes: 60,
			weeklyLimitMinutes: 300,
			allowedDays: WEEKEND,
		});
		const policy = await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			dailyLimitMinutes: 90,
			weeklyLimitMinutes: 300,
		});
		expect(policy.allowedDays).toEqual(WEEKEND);
	});

	test("at least one day, and only days of the week", async () => {
		for (const allowedDays of [[], [1, 7], [1.5]]) {
			await expect(
				kit.core.setPolicy(h.mom, {
					childId: h.childId,
					dailyLimitMinutes: 60,
					weeklyLimitMinutes: 300,
					allowedDays,
				}),
			).rejects.toMatchObject({
				code: "invalid_input",
				details: { field: "allowedDays" },
			});
		}
	});

	test("the grace is at most 15 minutes", async () => {
		await expect(
			kit.core.setPolicy(h.mom, {
				childId: h.childId,
				dailyLimitMinutes: 60,
				weeklyLimitMinutes: 300,
				graceMinutes: 16,
			}),
		).rejects.toMatchObject({
			code: "invalid_input",
			details: { field: "graceMinutes" },
		});
	});
});

describe("a day off", () => {
	beforeEach(() => seed({ allowedDays: WEEKEND }));

	test("the balance says so, with nothing available", async () => {
		const view = await kit.core.getChildBalance(h.child, {
			childId: h.childId,
		});
		expect(view.balances[0]).toMatchObject({
			dayAllowed: false,
			allowedDays: WEEKEND,
			availableSeconds: 0,
		});
	});

	test("the child cannot ask to start or for extra time", async () => {
		for (const requestType of ["start", "extra_time"] as const) {
			await expect(
				kit.core.createRequest(h.child, {
					requestType,
					activityId: h.gameId,
					requestedMinutes: 30,
					reason: "Quiero terminar",
				}),
			).rejects.toMatchObject({
				code: "day_not_allowed",
				details: { nextAllowedAt: "2026-10-24T05:00:00.000Z" },
			});
		}
	});

	test("a parent cannot start a normal session", async () => {
		await expect(
			kit.core.startDirectSession(h.mom, {
				childId: h.childId,
				activityId: h.gameId,
				minutes: 30,
			}),
		).rejects.toMatchObject({ code: "day_not_allowed" });
	});

	test("a parent can still give extra time, with a reason", async () => {
		const { session } = await kit.core.grantOverride(h.mom, {
			childId: h.childId,
			activityId: h.gameId,
			extraMinutes: 30,
			reason: "Cumpleaños del primo",
		});
		expect(session.status).toBe("running");
	});

	test("an activity with its own days is not touched by the general ones", async () => {
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			activityId: h.tvId,
			dailyLimitMinutes: 30,
			weeklyLimitMinutes: 120,
			allowedDays: [3],
		});
		const request = await kit.core.createRequest(h.child, {
			requestType: "start",
			activityId: h.tvId,
			requestedMinutes: 20,
		});
		expect(request.status).toBe("pending");
	});
});

describe("grace", () => {
	beforeEach(() => seed({ graceMinutes: 2 }));

	test("a session takes the policy's grace", async () => {
		const session = await kit.core.startDirectSession(h.mom, {
			childId: h.childId,
			activityId: h.gameId,
			minutes: 30,
		});
		expect(session.graceSeconds).toBe(120);
	});

	test("stopped within the grace, the excess does not count", async () => {
		const session = await kit.core.startDirectSession(h.mom, {
			childId: h.childId,
			activityId: h.gameId,
			minutes: 30,
		});
		kit.clock.advanceMinutes(31);
		const stopped = await kit.core.stopSession(h.dad, {
			sessionId: session.id,
		});
		// The real time is kept; only the balance leaves the grace out.
		expect(stopped.consumedSeconds).toBe(31 * 60);
		expect(await available()).toBe(30);
	});

	test("past the grace, only what goes beyond it counts", async () => {
		const session = await kit.core.startDirectSession(h.mom, {
			childId: h.childId,
			activityId: h.gameId,
			minutes: 30,
		});
		kit.clock.advanceMinutes(40);
		await kit.core.stopSession(h.dad, { sessionId: session.id });
		expect(await available()).toBe(22);
	});

	test("changing the grace later does not change a session already started", async () => {
		const session = await kit.core.startDirectSession(h.mom, {
			childId: h.childId,
			activityId: h.gameId,
			minutes: 30,
		});
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			dailyLimitMinutes: 60,
			weeklyLimitMinutes: 300,
			graceMinutes: 0,
		});
		kit.clock.advanceMinutes(31);
		await kit.core.stopSession(h.dad, { sessionId: session.id });
		expect(await available()).toBe(30);
	});

	test("a scheduled session takes the grace in force when it starts", async () => {
		const session = await kit.core.startDirectSession(h.mom, {
			childId: h.childId,
			activityId: h.gameId,
			minutes: 30,
			startAt: new Date("2026-10-21T21:00:00Z"),
		});
		await kit.core.setPolicy(h.mom, {
			childId: h.childId,
			dailyLimitMinutes: 60,
			weeklyLimitMinutes: 300,
			graceMinutes: 5,
		});
		kit.clock.advanceMinutes(60);
		await kit.core.handleJob({ alertId: alertOf(session.id, "start").id });
		expect(kit.db.get("sessions", session.id).graceSeconds).toBe(300);
	});

	test("the end push tells each side about the grace", async () => {
		const session = await kit.core.startDirectSession(h.mom, {
			childId: h.childId,
			activityId: h.gameId,
			minutes: 30,
		});
		kit.notifier.clear();
		kit.clock.advanceMinutes(30);
		await kit.core.handleJob({ alertId: alertOf(session.id, "end").id });
		expect(kit.notifier.sent.map((sent) => sent.message.body)).toEqual([
			"Terminó Juego de Mateo. Si la detienes en 2 min, lo que se pase no cuenta.",
			"Terminó Juego. Tienes 2 min para avisar a mamá o papá que lo detengan.",
		]);
	});
});
