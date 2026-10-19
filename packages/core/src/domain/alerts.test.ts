import { describe, expect, test } from "bun:test";
import { runningSession } from "../testing/builders";
import { planRunningAlerts } from "./alerts";

const settings = { warningMinutes: 5, autoCloseAfterMinutes: 30 };

function plan(session: ReturnType<typeof runningSession>, now: string) {
	return planRunningAlerts(session, new Date(now), settings).map((alert) => ({
		type: alert.type,
		at: alert.at.toISOString(),
	}));
}

describe("planRunningAlerts", () => {
	test("plans warning, end and auto_close from the start", () => {
		const session = runningSession("2026-10-21T20:00:00Z", {
			plannedMinutes: 30,
		});
		expect(plan(session, "2026-10-21T20:00:00Z")).toEqual([
			{ type: "warning", at: "2026-10-21T20:25:00.000Z" },
			{ type: "end", at: "2026-10-21T20:30:00.000Z" },
			{ type: "auto_close", at: "2026-10-21T21:00:00.000Z" },
		]);
	});

	test("recomputes from the remaining time after a pause", () => {
		// 10 min done before a 20 min pause; resumed at 20:30.
		const session = runningSession("2026-10-21T20:00:00Z", {
			plannedMinutes: 30,
			pauses: [{ from: "2026-10-21T20:10:00Z", to: "2026-10-21T20:30:00Z" }],
		});
		expect(plan(session, "2026-10-21T20:30:00Z")).toEqual([
			{ type: "warning", at: "2026-10-21T20:45:00.000Z" },
			{ type: "end", at: "2026-10-21T20:50:00.000Z" },
			{ type: "auto_close", at: "2026-10-21T21:20:00.000Z" },
		]);
	});

	test("skips the warning when less than warning_minutes are left", () => {
		const session = runningSession("2026-10-21T20:00:00Z", {
			plannedMinutes: 3,
		});
		expect(plan(session, "2026-10-21T20:00:00Z").map((a) => a.type)).toEqual([
			"end",
			"auto_close",
		]);
	});

	test("past the end, only auto_close is left", () => {
		// Paused after running 35 of 30 min, resumed now.
		const session = runningSession("2026-10-21T20:00:00Z", {
			plannedMinutes: 30,
			pauses: [{ from: "2026-10-21T20:35:00Z", to: "2026-10-21T21:00:00Z" }],
		});
		expect(plan(session, "2026-10-21T21:00:00Z")).toEqual([
			{ type: "auto_close", at: "2026-10-21T21:25:00.000Z" },
		]);
	});
});
