import { beforeEach, describe, expect, test } from "bun:test";
import type { Session } from "../domain/session";
import {
	createTestKit,
	type Household,
	seedHousehold,
	type TestKit,
} from "../testing";
import { finishedSession } from "../testing/builders";

// Wednesday 21 Oct 2026, 15:00 in Guayaquil. 60 min a day, 300 a week.
const NOW = "2026-10-21T15:00:00-05:00";

let kit: TestKit;
let h: Household;

beforeEach(() => {
	kit = createTestKit(NOW);
	h = seedHousehold(kit);
});

function start(minutes = 30, startAt?: Date): Promise<Session> {
	return kit.core.startDirectSession(h.mom, {
		childId: h.childId,
		activityId: h.gameId,
		minutes,
		startAt,
	});
}

function pendingAlerts(sessionId: string) {
	return kit.db
		.all("alerts")
		.filter(
			(alert) =>
				alert.sessionId === sessionId &&
				alert.sentAt === null &&
				alert.cancelledAt === null,
		)
		.map((alert) => [alert.alertType, alert.scheduledAt.toISOString()]);
}

async function available(): Promise<number> {
	const view = await kit.core.getChildBalance(h.mom, { childId: h.childId });
	return (view.balances[0]?.availableSeconds ?? 0) / 60;
}

describe("startDirectSession", () => {
	test("starts now with warning, end and auto_close jobs", async () => {
		const session = await start(30);
		expect(session.status).toBe("running");
		expect(session.startedAt?.toISOString()).toBe("2026-10-21T20:00:00.000Z");
		expect(pendingAlerts(session.id)).toEqual([
			["warning", "2026-10-21T20:25:00.000Z"],
			["end", "2026-10-21T20:30:00.000Z"],
			["auto_close", "2026-10-21T21:00:00.000Z"],
		]);
		// Each alert row keeps the provider's id, to cancel it later.
		expect(
			kit.db.all("alerts").map((alert) => alert.providerMessageId),
		).toEqual(kit.jobs.scheduled.map((job) => job.providerMessageId));
	});

	test("never longer than what is available", async () => {
		kit.db.set("sessions", {
			...finishedSession("2026-10-21T10:00:00-05:00", 50),
			childId: h.childId,
		});
		await expect(start(11)).rejects.toMatchObject({
			code: "exceeds_available",
		});
		await expect(start(10)).resolves.toMatchObject({ status: "running" });
	});

	test("with nothing left it needs an override", async () => {
		kit.db.set("sessions", {
			...finishedSession("2026-10-21T10:00:00-05:00", 60),
			childId: h.childId,
		});
		await expect(start(5)).rejects.toMatchObject({ code: "quota_exhausted" });
	});

	test("one open session per child", async () => {
		await start(20);
		await expect(start(10)).rejects.toMatchObject({
			code: "session_already_open",
		});
	});

	test("without a policy there is nothing to draw from", async () => {
		const other = seedHousehold(kit, { prefix: "x-", policy: null });
		await expect(
			kit.core.startDirectSession(other.mom, {
				childId: other.childId,
				activityId: other.gameId,
				minutes: 10,
			}),
		).rejects.toMatchObject({ code: "no_active_policy" });
	});

	test("the child cannot start a session", async () => {
		await expect(
			kit.core.startDirectSession(h.child, {
				childId: h.childId,
				activityId: h.gameId,
				minutes: 10,
			}),
		).rejects.toMatchObject({ code: "forbidden" });
	});

	test("a parent of another family cannot see the child", async () => {
		const other = seedHousehold(kit, { prefix: "x-" });
		await expect(
			kit.core.startDirectSession(other.mom, {
				childId: h.childId,
				activityId: h.gameId,
				minutes: 10,
			}),
		).rejects.toMatchObject({ code: "child_not_found" });
	});
});

describe("the running session counts in the balance", () => {
	test("its elapsed time is taken from what is available", async () => {
		await start(30);
		kit.clock.advanceMinutes(12);
		expect(await available()).toBe(48);
	});

	test("paused time is not", async () => {
		const session = await start(30);
		kit.clock.advanceMinutes(10);
		await kit.core.pauseSession(h.mom, { sessionId: session.id });
		kit.clock.advanceMinutes(40);
		expect(await available()).toBe(50);
	});
});

describe("pause and resume", () => {
	test("pausing cancels the jobs; resuming reschedules them from now", async () => {
		const session = await start(30);
		const firstJobs = kit.jobs.scheduled.map((job) => job.providerMessageId);

		kit.clock.advanceMinutes(10);
		const paused = await kit.core.pauseSession(h.mom, {
			sessionId: session.id,
			reason: "cena",
		});
		expect(paused.status).toBe("paused");
		expect(paused.pauses[0]?.reason).toBe("cena");
		expect(pendingAlerts(session.id)).toEqual([]);
		expect(kit.jobs.cancelled).toEqual(firstJobs);

		kit.clock.advanceMinutes(20); // 15:30
		const resumed = await kit.core.resumeSession(h.dad, {
			sessionId: session.id,
		});
		expect(resumed.status).toBe("running");
		expect(resumed.pauses[0]?.resumedByParentId).toBe(h.dad.parentId);
		// 20 min left from 15:30 local.
		expect(pendingAlerts(session.id)).toEqual([
			["warning", "2026-10-21T20:45:00.000Z"],
			["end", "2026-10-21T20:50:00.000Z"],
			["auto_close", "2026-10-21T21:20:00.000Z"],
		]);
		expect(kit.jobs.active()).toHaveLength(3);
	});

	test("cannot pause twice or resume a running session", async () => {
		const session = await start(30);
		await expect(
			kit.core.resumeSession(h.mom, { sessionId: session.id }),
		).rejects.toMatchObject({ code: "invalid_session_transition" });
		await kit.core.pauseSession(h.mom, { sessionId: session.id });
		await expect(
			kit.core.pauseSession(h.dad, { sessionId: session.id }),
		).rejects.toMatchObject({ code: "invalid_session_transition" });
	});

	test("a pause still blocks a new session", async () => {
		const session = await start(30);
		await kit.core.pauseSession(h.mom, { sessionId: session.id });
		await expect(start(10)).rejects.toMatchObject({
			code: "session_already_open",
		});
	});

	test("the child cannot pause, resume or stop", async () => {
		const session = await start(30);
		const input = { sessionId: session.id };
		await expect(kit.core.pauseSession(h.child, input)).rejects.toMatchObject({
			code: "forbidden",
		});
		await expect(kit.core.resumeSession(h.child, input)).rejects.toMatchObject({
			code: "forbidden",
		});
		await expect(kit.core.stopSession(h.child, input)).rejects.toMatchObject({
			code: "forbidden",
		});
	});

	test("a parent of another family gets not found", async () => {
		const other = seedHousehold(kit, { prefix: "x-" });
		const session = await start(30);
		await expect(
			kit.core.pauseSession(other.mom, { sessionId: session.id }),
		).rejects.toMatchObject({ code: "session_not_found" });
	});
});

describe("stopSession", () => {
	test("before the end: stopped_early, consumes the real time", async () => {
		const session = await start(30);
		kit.clock.advanceMinutes(12);
		const stopped = await kit.core.stopSession(h.dad, {
			sessionId: session.id,
		});
		expect(stopped).toMatchObject({
			status: "finished",
			endReason: "stopped_early",
			consumedSeconds: 12 * 60,
			endedByParentId: h.dad.parentId,
		});
		expect(pendingAlerts(session.id)).toEqual([]);
		expect(kit.jobs.active()).toHaveLength(0);
		expect(await available()).toBe(48);
	});

	test("past the end: completed, and the overrun counts", async () => {
		const session = await start(30);
		kit.clock.advanceMinutes(42);
		const stopped = await kit.core.stopSession(h.mom, {
			sessionId: session.id,
		});
		expect(stopped.endReason).toBe("completed");
		expect(stopped.consumedSeconds).toBe(42 * 60);
		expect(await available()).toBe(18);
	});

	test("a paused session can be stopped; its pause is closed", async () => {
		const session = await start(30);
		kit.clock.advanceMinutes(5);
		await kit.core.pauseSession(h.mom, { sessionId: session.id });
		kit.clock.advanceMinutes(30);
		const stopped = await kit.core.stopSession(h.mom, {
			sessionId: session.id,
		});
		expect(stopped.consumedSeconds).toBe(5 * 60);
		expect(stopped.pauses[0]?.resumedAt?.toISOString()).toBe(
			stopped.endedAt?.toISOString(),
		);
	});
});

describe("scheduled sessions", () => {
	const SIX_PM = new Date("2026-10-21T18:00:00-05:00");

	test("a parent can start it early: its start job is cancelled", async () => {
		const session = await start(30, SIX_PM);
		const startJob = kit.jobs.scheduled[0];
		expect(startJob?.alertType).toBe("start");

		kit.clock.advanceMinutes(60);
		const started = await kit.core.advanceScheduledSession(h.dad, {
			sessionId: session.id,
		});
		expect(started.status).toBe("running");
		expect(started.startedAt?.toISOString()).toBe("2026-10-21T21:00:00.000Z");
		expect(kit.jobs.cancelled).toEqual([startJob?.providerMessageId ?? ""]);
		expect(pendingAlerts(session.id).map(([type]) => type)).toEqual([
			"warning",
			"end",
			"auto_close",
		]);
		expect(kit.notifier.sent.at(-1)?.message.kind).toBe("session_ready");
	});

	test("a parent can cancel it: its start job is cancelled", async () => {
		const session = await start(30, SIX_PM);
		const cancelled = await kit.core.cancelScheduledSession(h.mom, {
			sessionId: session.id,
		});
		expect(cancelled).toMatchObject({
			status: "cancelled",
			endedByParentId: h.mom.parentId,
		});
		expect(kit.jobs.active()).toHaveLength(0);
		await expect(start(30)).resolves.toMatchObject({ status: "running" });
	});

	test("only scheduled sessions can be started early or cancelled", async () => {
		const session = await start(30);
		await expect(
			kit.core.advanceScheduledSession(h.mom, { sessionId: session.id }),
		).rejects.toMatchObject({ code: "invalid_session_transition" });
		await expect(
			kit.core.cancelScheduledSession(h.mom, { sessionId: session.id }),
		).rejects.toMatchObject({ code: "invalid_session_transition" });
	});
});

describe("getLiveSession", () => {
	test("returns the server time and the computed clock", async () => {
		const session = await start(30);
		kit.clock.advanceSeconds(10 * 60 + 30);
		const view = await kit.core.getLiveSession(h.child, { childId: h.childId });
		expect(view.serverTime.toISOString()).toBe("2026-10-21T20:10:30.000Z");
		expect(view.live?.session.id).toBe(session.id);
		expect(view.live?.elapsedSeconds).toBe(630);
		expect(view.live?.remainingSeconds).toBe(1170);
		expect(view.live?.endsAt?.toISOString()).toBe("2026-10-21T20:30:00.000Z");
	});

	test("a paused session has no end time", async () => {
		const session = await start(30);
		await kit.core.pauseSession(h.mom, { sessionId: session.id });
		const view = await kit.core.getLiveSession(h.mom, { childId: h.childId });
		expect(view.live?.endsAt).toBeNull();
	});

	test("nothing open: live is null", async () => {
		const view = await kit.core.getLiveSession(h.mom, { childId: h.childId });
		expect(view.live).toBeNull();
	});

	test("a child only sees their own", async () => {
		await expect(
			kit.core.getLiveSession(
				{ kind: "child", childId: "sibling", familyId: h.familyId },
				{ childId: h.childId },
			),
		).rejects.toMatchObject({ code: "forbidden" });
	});
});
