import { beforeEach, describe, expect, test } from "bun:test";
import type { AlertType } from "../domain/alerts";
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
});

async function startSession(minutes = 30) {
	return kit.core.startDirectSession(h.mom, {
		childId: h.childId,
		activityId: h.gameId,
		minutes,
	});
}

function alertOf(sessionId: string, type: AlertType) {
	const alert = kit.db
		.all("alerts")
		.find(
			(candidate) =>
				candidate.sessionId === sessionId &&
				candidate.alertType === type &&
				candidate.cancelledAt === null,
		);
	if (alert === undefined) {
		throw new Error(`no ${type} alert`);
	}
	return alert;
}

describe("handleJob: warning and end", () => {
	test("warning pushes to parents and child, each to their page", async () => {
		const session = await startSession(30);
		kit.notifier.clear();
		kit.clock.advanceMinutes(25);
		const outcome = await kit.core.handleJob({
			alertId: alertOf(session.id, "warning").id,
		});
		expect(outcome).toEqual({
			status: "handled",
			alertType: "warning",
			sessionId: session.id,
		});
		expect(kit.notifier.sent).toMatchObject([
			{
				to: [h.auth.mom, h.auth.dad],
				message: {
					kind: "session_warning",
					title: "Quedan 5 min",
					url: "/padres",
				},
			},
			{
				to: [h.auth.child],
				message: { kind: "session_warning", url: "/nino" },
			},
		]);
		expect(alertOf(session.id, "warning").sentAt?.toISOString()).toBe(
			"2026-10-21T20:25:00.000Z",
		);
	});

	test("end pushes to parents and child", async () => {
		const session = await startSession(30);
		kit.notifier.clear();
		kit.clock.advanceMinutes(30);
		await kit.core.handleJob({ alertId: alertOf(session.id, "end").id });
		expect(kit.notifier.kinds()).toEqual(["session_ended", "session_ended"]);
	});
});

describe("handleJob is idempotent", () => {
	test("a repeated delivery does nothing", async () => {
		const session = await startSession(30);
		const alertId = alertOf(session.id, "end").id;
		kit.clock.advanceMinutes(30);
		await kit.core.handleJob({ alertId });
		kit.notifier.clear();
		expect(await kit.core.handleJob({ alertId })).toEqual({
			status: "ignored",
			reason: "already_sent",
		});
		expect(kit.notifier.sent).toHaveLength(0);
	});

	test("a job cancelled by a pause does nothing", async () => {
		const session = await startSession(30);
		const alertId = alertOf(session.id, "end").id;
		kit.clock.advanceMinutes(10);
		await kit.core.pauseSession(h.mom, { sessionId: session.id });
		kit.notifier.clear();
		kit.clock.advanceMinutes(20);
		expect(await kit.core.handleJob({ alertId })).toEqual({
			status: "ignored",
			reason: "already_cancelled",
		});
		expect(kit.notifier.sent).toHaveLength(0);
	});

	test("a job for a session no longer in the expected state does nothing", async () => {
		const session = await startSession(30);
		const alertId = alertOf(session.id, "auto_close").id;
		// The alert row was left pending, but the session is already paused.
		kit.db.set("sessions", {
			...kit.db.get("sessions", session.id),
			status: "paused",
		});
		expect(await kit.core.handleJob({ alertId })).toEqual({
			status: "ignored",
			reason: "unexpected_session_state",
		});
		expect(kit.db.get("sessions", session.id).status).toBe("paused");
		expect(kit.db.get("alerts", alertId).sentAt).toBeNull();
	});

	test("a job whose alert row never committed does nothing", async () => {
		expect(await kit.core.handleJob({ alertId: "missing" })).toEqual({
			status: "ignored",
			reason: "alert_not_found",
		});
	});

	test("concurrent deliveries: only one handles it", async () => {
		const session = await startSession(30);
		const alertId = alertOf(session.id, "auto_close").id;
		kit.clock.advanceMinutes(60);
		const outcomes = await Promise.all([
			kit.core.handleJob({ alertId }),
			kit.core.handleJob({ alertId }),
		]);
		expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
			"handled",
			"ignored",
		]);
	});

	test("a failed transaction does not mark the alert as sent", async () => {
		const session = await startSession(30);
		const alertId = alertOf(session.id, "auto_close").id;
		kit.clock.advanceMinutes(60);
		const update = kit.db.repos.sessions.update;
		kit.db.repos.sessions.update = async () => {
			throw new Error("connection lost");
		};
		await expect(kit.core.handleJob({ alertId })).rejects.toThrow(
			"connection lost",
		);
		kit.db.repos.sessions.update = update;
		expect(kit.db.get("alerts", alertId).sentAt).toBeNull();
		// QStash retries, and this time it works.
		expect(await kit.core.handleJob({ alertId })).toMatchObject({
			status: "handled",
		});
	});
});

describe("auto close", () => {
	test("closes the forgotten session at end + margin and tells the parents", async () => {
		const session = await startSession(30);
		kit.notifier.clear();
		kit.clock.advanceMinutes(60); // 30 planned + 30 margin
		await kit.core.handleJob({ alertId: alertOf(session.id, "auto_close").id });

		const closed = kit.db.get("sessions", session.id);
		expect(closed).toMatchObject({
			status: "finished",
			endReason: "auto_closed",
			consumedSeconds: 60 * 60,
			endedByParentId: null,
		});
		expect(closed.endedAt?.toISOString()).toBe("2026-10-21T21:00:00.000Z");
		expect(kit.notifier.sent).toMatchObject([
			{
				to: [h.auth.mom, h.auth.dad],
				message: {
					kind: "session_auto_closed",
					body: "Nadie detuvo Juego de Mateo. Se cerró y contó 60 min.",
				},
			},
		]);

		// It consumed planned + margin: the whole day.
		const view = await kit.core.getChildBalance(h.mom, { childId: h.childId });
		expect(view.balances[0]?.availableSeconds).toBe(0);
	});

	test("uses the family's margin", async () => {
		kit = createTestKit(NOW);
		h = seedHousehold(kit, {
			autoCloseAfterMinutes: 10,
			policy: { dailyLimitMinutes: 120, weeklyLimitMinutes: 600 },
		});
		const session = await startSession(30);
		expect(alertOf(session.id, "auto_close").scheduledAt.toISOString()).toBe(
			"2026-10-21T20:40:00.000Z",
		);
		kit.clock.advanceMinutes(40);
		await kit.core.handleJob({ alertId: alertOf(session.id, "auto_close").id });
		expect(kit.db.get("sessions", session.id).consumedSeconds).toBe(40 * 60);
	});

	test("after a pause, it closes at the recomputed time", async () => {
		const session = await startSession(30);
		kit.clock.advanceMinutes(10);
		await kit.core.pauseSession(h.mom, { sessionId: session.id });
		kit.clock.advanceMinutes(15);
		await kit.core.resumeSession(h.mom, { sessionId: session.id });
		const autoClose = alertOf(session.id, "auto_close");
		// 20 min left from 15:25 + 30 margin.
		expect(autoClose.scheduledAt.toISOString()).toBe(
			"2026-10-21T21:15:00.000Z",
		);
		kit.clock.set(autoClose.scheduledAt);
		await kit.core.handleJob({ alertId: autoClose.id });
		expect(kit.db.get("sessions", session.id)).toMatchObject({
			status: "finished",
			consumedSeconds: 60 * 60,
		});
	});

	test("a session stopped by a parent is not closed again", async () => {
		const session = await startSession(30);
		const alertId = alertOf(session.id, "auto_close").id;
		kit.clock.advanceMinutes(20);
		await kit.core.stopSession(h.mom, { sessionId: session.id });
		kit.clock.advanceMinutes(40);
		expect(await kit.core.handleJob({ alertId })).toEqual({
			status: "ignored",
			reason: "already_cancelled",
		});
		expect(kit.db.get("sessions", session.id).endReason).toBe("stopped_early");
	});
});
