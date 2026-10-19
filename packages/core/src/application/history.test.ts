import { beforeEach, describe, expect, test } from "bun:test";
import {
	createTestKit,
	type Household,
	seedHousehold,
	type TestKit,
} from "../testing";
import { finishedSession, scheduledSession } from "../testing/builders";

// Wednesday 21 Oct 2026, 15:00 in Guayaquil (UTC−5). The week runs from
// Monday 19 to Monday 26.
const NOW = "2026-10-21T15:00:00-05:00";

let kit: TestKit;
let h: Household;

beforeEach(() => {
	kit = createTestKit(NOW);
	h = seedHousehold(kit);
});

function addSession(session: ReturnType<typeof finishedSession>) {
	kit.db.set("sessions", { ...session, childId: h.childId });
}

describe("getChildHistory", () => {
	test("this week by default: sessions, usage per activity and the rest", async () => {
		addSession(
			finishedSession("2026-10-19T16:00:00-05:00", 30, {
				activityId: h.gameId,
			}),
		);
		addSession(
			finishedSession("2026-10-20T16:00:00-05:00", 20, { activityId: h.tvId }),
		);
		addSession(
			finishedSession("2026-10-21T10:00:00-05:00", 15, {
				activityId: h.gameId,
			}),
		);
		// Last week: left out.
		addSession(
			finishedSession("2026-10-18T16:00:00-05:00", 40, {
				activityId: h.gameId,
			}),
		);
		const report = await kit.core.reportTask(h.child, {
			bonusTaskId: (
				await kit.core.createBonusTask(h.mom, {
					name: "Deberes",
					rewardMinutes: 15,
				})
			).id,
		});
		const request = await kit.core.createRequest(h.child, {
			requestType: "start",
			activityId: h.gameId,
			requestedMinutes: 10,
		});

		const history = await kit.core.getChildHistory(h.mom, {
			childId: h.childId,
		});

		expect(history.period).toEqual({
			start: new Date("2026-10-19T00:00:00-05:00"),
			end: new Date("2026-10-26T00:00:00-05:00"),
		});
		expect(
			history.sessions.map((session) => session.startedAt?.toISOString()),
		).toEqual([
			"2026-10-21T15:00:00.000Z",
			"2026-10-20T21:00:00.000Z",
			"2026-10-19T21:00:00.000Z",
		]);
		expect(history.usageByActivity).toEqual(
			expect.arrayContaining([
				{ activityId: h.gameId, consumedSeconds: 45 * 60 },
				{ activityId: h.tvId, consumedSeconds: 20 * 60 },
			]),
		);
		expect(history.usageByActivity).toHaveLength(2);
		expect(history.requests.map((r) => r.id)).toEqual([request.id]);
		expect(history.taskReports.map((r) => r.id)).toEqual([report.id]);
		expect(history.serverTime).toEqual(new Date(NOW));
	});

	test("a scheduled session counts by its scheduled start and uses nothing", async () => {
		addSession(
			scheduledSession("2026-10-21T18:00:00-05:00", { activityId: h.gameId }),
		);
		const history = await kit.core.getChildHistory(h.child, {
			childId: h.childId,
		});
		expect(history.sessions).toHaveLength(1);
		expect(history.usageByActivity).toEqual([]);
	});

	test("an explicit period, and overdue requests show as expired", async () => {
		await kit.core.createRequest(h.child, {
			requestType: "start",
			activityId: h.gameId,
			requestedMinutes: 10,
		});
		kit.clock.advanceMinutes(20);

		const history = await kit.core.getChildHistory(h.child, {
			childId: h.childId,
			from: new Date("2026-10-21T00:00:00-05:00"),
			to: new Date("2026-10-22T00:00:00-05:00"),
		});

		expect(history.requests.map((r) => r.status)).toEqual(["expired"]);
		expect(kit.db.all("requests")[0]?.status).toBe("expired");
	});

	test("rejects broken or too long periods", async () => {
		const ask = (from?: string, to?: string) =>
			kit.core.getChildHistory(h.mom, {
				childId: h.childId,
				...(from === undefined ? {} : { from: new Date(from) }),
				...(to === undefined ? {} : { to: new Date(to) }),
			});
		await expect(ask("2026-10-21T00:00:00Z")).rejects.toMatchObject({
			code: "invalid_input",
		});
		await expect(
			ask("2026-10-21T00:00:00Z", "2026-10-20T00:00:00Z"),
		).rejects.toMatchObject({
			code: "invalid_input",
			details: { field: "to" },
		});
		await expect(
			ask("2026-01-01T00:00:00Z", "2026-10-20T00:00:00Z"),
		).rejects.toMatchObject({
			code: "invalid_input",
			details: { field: "period" },
		});
	});

	test("another family's child does not exist", async () => {
		const other = seedHousehold(kit, { prefix: "other-" });
		await expect(
			kit.core.getChildHistory(other.mom, { childId: h.childId }),
		).rejects.toMatchObject({ code: "child_not_found" });
	});
});
