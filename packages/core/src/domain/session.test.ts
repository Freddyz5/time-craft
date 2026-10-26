import { describe, expect, test } from "bun:test";
import { isDomainError } from "../errors";
import { runningSession, scheduledSession } from "../testing/builders";
import {
	canTransition,
	consumedSeconds,
	elapsedSeconds,
	markCancelled,
	markFinished,
	markPaused,
	markResumed,
	markStarted,
	remainingSeconds,
	type SessionStatus,
	stopReason,
} from "./session";

const at = (iso: string) => new Date(iso);

describe("state machine", () => {
	const allowed: [SessionStatus, SessionStatus][] = [
		["scheduled", "running"],
		["scheduled", "cancelled"],
		["running", "paused"],
		["running", "finished"],
		["paused", "running"],
		["paused", "finished"],
	];
	const statuses: SessionStatus[] = [
		"scheduled",
		"running",
		"paused",
		"finished",
		"cancelled",
	];

	test("allows exactly the documented transitions", () => {
		for (const from of statuses) {
			for (const to of statuses) {
				const expected = allowed.some(([a, b]) => a === from && b === to);
				expect(canTransition(from, to)).toBe(expected);
			}
		}
	});

	test("rejects an invalid transition with invalid_session_transition", () => {
		const session = scheduledSession("2026-10-21T20:00:00Z");
		try {
			markPaused(session, {
				id: "p",
				at: at("2026-10-21T20:00:00Z"),
				parentId: "parent",
				reason: null,
			});
			throw new Error("expected an error");
		} catch (error) {
			expect(isDomainError(error) && error.code).toBe(
				"invalid_session_transition",
			);
		}
	});

	test("goes scheduled → running ⇄ paused → finished", () => {
		const scheduled = scheduledSession("2026-10-21T20:00:00Z", {
			plannedMinutes: 30,
		});
		const running = markStarted(scheduled, at("2026-10-21T20:00:00Z"), 1200);
		expect(running.status).toBe("running");
		expect(running.plannedDurationSeconds).toBe(1200);

		const paused = markPaused(running, {
			id: "p1",
			at: at("2026-10-21T20:05:00Z"),
			parentId: "mom",
			reason: "cena",
		});
		expect(paused.status).toBe("paused");
		expect(running.pauses).toHaveLength(0); // inputs are not mutated

		const resumed = markResumed(paused, at("2026-10-21T20:15:00Z"), "dad");
		expect(resumed.pauses[0]?.resumedAt?.toISOString()).toBe(
			"2026-10-21T20:15:00.000Z",
		);
		expect(resumed.pauses[0]?.resumedByParentId).toBe("dad");

		const finished = markFinished(resumed, {
			at: at("2026-10-21T20:30:00Z"),
			reason: "completed",
			parentId: "mom",
			consumedSeconds: 1200,
		});
		expect(finished.status).toBe("finished");
		expect(finished.endedByParentId).toBe("mom");
	});

	test("cancelling a scheduled session records who did it", () => {
		const cancelled = markCancelled(
			scheduledSession("2026-10-21T22:00:00Z"),
			at("2026-10-21T20:00:00Z"),
			"dad",
		);
		expect(cancelled.status).toBe("cancelled");
		expect(cancelled.endedByParentId).toBe("dad");
		expect(cancelled.startedAt).toBeNull();
	});

	test("finishing a paused session closes the open pause", () => {
		const paused = runningSession("2026-10-21T20:00:00Z", {
			pauses: [{ from: "2026-10-21T20:10:00Z", to: null }],
		});
		const finished = markFinished(paused, {
			at: at("2026-10-21T20:40:00Z"),
			reason: "stopped_early",
			parentId: "mom",
			consumedSeconds: 600,
		});
		expect(finished.pauses[0]?.resumedAt?.toISOString()).toBe(
			"2026-10-21T20:40:00.000Z",
		);
	});
});

describe("elapsed and remaining", () => {
	test("pauses do not count, an open pause counts until now", () => {
		const session = runningSession("2026-10-21T20:00:00Z", {
			plannedMinutes: 30,
			pauses: [
				{ from: "2026-10-21T20:05:00Z", to: "2026-10-21T20:15:00Z" },
				{ from: "2026-10-21T20:20:00Z", to: null },
			],
		});
		// 30 min of wall time, 10 + 10 paused.
		const now = at("2026-10-21T20:30:00Z");
		expect(elapsedSeconds(session, now)).toBe(10 * 60);
		expect(remainingSeconds(session, now)).toBe(20 * 60);
	});

	test("remaining goes negative past the planned end", () => {
		const session = runningSession("2026-10-21T20:00:00Z", {
			plannedMinutes: 30,
		});
		expect(remainingSeconds(session, at("2026-10-21T20:35:00Z"))).toBe(-300);
	});

	test("scheduled sessions consume nothing", () => {
		expect(
			consumedSeconds(
				scheduledSession("2026-10-21T20:00:00Z"),
				at("2026-10-21T21:00:00Z"),
			),
		).toBe(0);
	});

	test("stopReason distinguishes completed from stopped_early", () => {
		const session = runningSession("2026-10-21T20:00:00Z", {
			plannedMinutes: 30,
		});
		expect(stopReason(session, 1799)).toBe("stopped_early");
		expect(stopReason(session, 1800)).toBe("completed");
		expect(stopReason(session, 2400)).toBe("completed");
	});
});
