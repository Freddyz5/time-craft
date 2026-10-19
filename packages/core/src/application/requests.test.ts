import { beforeEach, describe, expect, test } from "bun:test";
import {
	createTestKit,
	type Household,
	seedHousehold,
	type TestKit,
} from "../testing";
import { finishedSession } from "../testing/builders";

// Wednesday 21 Oct 2026, 15:00 in Guayaquil (UTC−5). Global policy: 60 min a
// day, 300 a week.
const NOW = "2026-10-21T15:00:00-05:00";

let kit: TestKit;
let h: Household;

beforeEach(() => {
	kit = createTestKit(NOW);
	h = seedHousehold(kit);
});

// A finished session of the child earlier today, to use up the quota.
function consumedToday(minutes: number) {
	kit.db.set("sessions", {
		...finishedSession("2026-10-21T13:00:00-05:00", minutes),
		childId: h.childId,
		activityId: h.gameId,
	});
}

function askToStart(minutes = 30) {
	return kit.core.createRequest(h.child, {
		requestType: "start",
		activityId: h.gameId,
		requestedMinutes: minutes,
	});
}

describe("createRequest", () => {
	test("creates a pending request and pushes it to both parents", async () => {
		const request = await askToStart(30);
		expect(request.status).toBe("pending");
		expect(request.expiresAt.toISOString()).toBe("2026-10-21T20:15:00.000Z");
		expect(kit.notifier.sent).toHaveLength(1);
		expect(kit.notifier.sent[0]?.to).toEqual([h.auth.mom, h.auth.dad]);
		expect(kit.notifier.sent[0]?.message.kind).toBe("request_created");
		expect(kit.notifier.sent[0]?.message.body).toBe(
			"Mateo pide 30 min de Juego",
		);
	});

	test("only the child asks", async () => {
		await expect(
			kit.core.createRequest(h.mom, {
				requestType: "start",
				activityId: h.gameId,
				requestedMinutes: 30,
			}),
		).rejects.toMatchObject({ code: "forbidden" });
	});

	test("a start request cannot exceed the time available", async () => {
		consumedToday(45);
		await expect(askToStart(20)).rejects.toMatchObject({
			code: "exceeds_available",
			details: { availableSeconds: 15 * 60 },
		});
	});

	test("with nothing left, start fails and extra_time is the way", async () => {
		consumedToday(60);
		await expect(askToStart(10)).rejects.toMatchObject({
			code: "quota_exhausted",
		});
		const request = await kit.core.createRequest(h.child, {
			requestType: "extra_time",
			activityId: h.gameId,
			requestedMinutes: 15,
			reason: "Terminé los deberes",
		});
		expect(request.requestType).toBe("extra_time");
		expect(kit.notifier.sent[0]?.message.body).toBe(
			"Mateo pide 15 min extra de Juego: «Terminé los deberes»",
		);
	});

	test("extra_time is refused while there is time available", async () => {
		consumedToday(30);
		await expect(
			kit.core.createRequest(h.child, {
				requestType: "extra_time",
				activityId: h.gameId,
				requestedMinutes: 15,
				reason: "porfa",
			}),
		).rejects.toMatchObject({
			code: "quota_not_exhausted",
			details: { availableSeconds: 30 * 60 },
		});
	});

	test("extra_time needs a reason", async () => {
		consumedToday(60);
		await expect(
			kit.core.createRequest(h.child, {
				requestType: "extra_time",
				activityId: h.gameId,
				requestedMinutes: 15,
				reason: "   ",
			}),
		).rejects.toMatchObject({
			code: "invalid_input",
			details: { field: "reason" },
		});
	});

	test("only one pending request at a time", async () => {
		await askToStart(20);
		await expect(askToStart(10)).rejects.toMatchObject({
			code: "request_already_pending",
		});
	});

	test("not while a session is open", async () => {
		await kit.core.startDirectSession(h.mom, {
			childId: h.childId,
			activityId: h.gameId,
			minutes: 20,
		});
		await expect(askToStart(10)).rejects.toMatchObject({
			code: "session_already_open",
		});
	});

	test("an inactive activity cannot be requested", async () => {
		kit.db.set("activities", {
			...kit.db.get("activities", h.tvId),
			isActive: false,
		});
		await expect(
			kit.core.createRequest(h.child, {
				requestType: "start",
				activityId: h.tvId,
				requestedMinutes: 10,
			}),
		).rejects.toMatchObject({ code: "activity_inactive" });
	});
});

describe("lazy expiry", () => {
	test("an overdue request is expired before creating the next one", async () => {
		const first = await askToStart(20);
		kit.clock.advanceMinutes(15);
		const second = await askToStart(10);

		const stored = kit.db.get("requests", first.id);
		expect(stored.status).toBe("expired");
		expect(stored.resolvedAt?.toISOString()).toBe(
			first.expiresAt.toISOString(),
		);
		expect(kit.db.get("requests", second.id).status).toBe("pending");
	});

	test("one minute before expiry it is still pending", async () => {
		await askToStart(20);
		kit.clock.advanceMinutes(14);
		await expect(askToStart(10)).rejects.toMatchObject({
			code: "request_already_pending",
		});
	});

	test("approving an overdue request fails and leaves it expired", async () => {
		const request = await askToStart(20);
		kit.clock.advanceMinutes(16);
		await expect(
			kit.core.approveRequest(h.mom, {
				requestId: request.id,
				approvedMinutes: 20,
			}),
		).rejects.toMatchObject({ code: "request_expired" });
		expect(kit.db.get("requests", request.id).status).toBe("expired");
		expect(kit.db.all("sessions")).toHaveLength(0);
	});

	test("listing pending requests expires the overdue ones", async () => {
		const request = await askToStart(20);
		expect(await kit.core.listPendingRequests(h.dad)).toHaveLength(1);
		kit.clock.advanceMinutes(15);
		expect(await kit.core.listPendingRequests(h.dad)).toEqual([]);
		expect(await kit.core.listPendingRequests(h.child)).toEqual([]);
		expect(kit.db.get("requests", request.id).status).toBe("expired");
	});
});

describe("approveRequest", () => {
	test("approving fewer minutes starts a session of that length now", async () => {
		const request = await askToStart(40);
		kit.notifier.clear();
		const result = await kit.core.approveRequest(h.mom, {
			requestId: request.id,
			approvedMinutes: 25,
			note: "después de la cena",
		});

		expect(result.request.status).toBe("approved");
		expect(result.request.approvedMinutes).toBe(25);
		expect(result.request.resolvedByParentId).toBe(h.mom.parentId);
		expect(result.override).toBeNull();
		expect(result.session.status).toBe("running");
		expect(result.session.requestId).toBe(request.id);
		expect(result.session.plannedDurationSeconds).toBe(25 * 60);
		expect(result.session.startedByParentId).toBe(h.mom.parentId);

		expect(
			kit.jobs.scheduled.map((job) => [job.alertType, job.runAt.toISOString()]),
		).toEqual([
			["warning", "2026-10-21T20:20:00.000Z"],
			["end", "2026-10-21T20:25:00.000Z"],
			["auto_close", "2026-10-21T20:55:00.000Z"],
		]);
		expect(kit.notifier.sent).toHaveLength(1);
		expect(kit.notifier.sent[0]?.to).toEqual([h.auth.child]);
		expect(kit.notifier.sent[0]?.message.kind).toBe("request_approved");
	});

	test("more minutes than requested is invalid", async () => {
		const request = await askToStart(20);
		await expect(
			kit.core.approveRequest(h.mom, {
				requestId: request.id,
				approvedMinutes: 30,
			}),
		).rejects.toMatchObject({ code: "exceeds_requested" });
	});

	test("the session never exceeds what is available at approval", async () => {
		const request = await askToStart(30);
		consumedToday(45); // used elsewhere since the request
		await expect(
			kit.core.approveRequest(h.mom, {
				requestId: request.id,
				approvedMinutes: 30,
			}),
		).rejects.toMatchObject({
			code: "exceeds_available",
			details: { availableSeconds: 15 * 60 },
		});
		expect(kit.db.get("requests", request.id).status).toBe("pending");
	});

	test("the second parent to approve gets a conflict", async () => {
		const request = await askToStart(30);
		await kit.core.approveRequest(h.mom, {
			requestId: request.id,
			approvedMinutes: 30,
		});
		await expect(
			kit.core.approveRequest(h.dad, {
				requestId: request.id,
				approvedMinutes: 20,
			}),
		).rejects.toMatchObject({ code: "request_already_resolved" });
		expect(kit.db.all("sessions")).toHaveLength(1);
	});

	test("if the other parent wins between read and write, nothing is created", async () => {
		const request = await askToStart(30);
		// The other parent's transaction commits right before this UPDATE runs.
		const update = kit.db.repos.requests.updateIfPending;
		kit.db.repos.requests.updateIfPending = async (changed) => {
			kit.db.set("requests", {
				...kit.db.get("requests", changed.id),
				status: "rejected",
				resolvedByParentId: h.dad.parentId,
				resolvedAt: kit.clock.now(),
			});
			return update(changed);
		};
		await expect(
			kit.core.approveRequest(h.mom, {
				requestId: request.id,
				approvedMinutes: 30,
			}),
		).rejects.toMatchObject({ code: "request_already_resolved" });
		expect(kit.db.all("sessions")).toHaveLength(0);
		expect(kit.db.all("alerts")).toHaveLength(0);
	});

	test("a parent of another family cannot see the request", async () => {
		const other = seedHousehold(kit, { prefix: "other-" });
		const request = await askToStart(30);
		await expect(
			kit.core.approveRequest(other.mom, {
				requestId: request.id,
				approvedMinutes: 30,
			}),
		).rejects.toMatchObject({ code: "request_not_found" });
	});

	test("the child cannot approve", async () => {
		const request = await askToStart(30);
		await expect(
			kit.core.approveRequest(h.child, {
				requestId: request.id,
				approvedMinutes: 30,
			}),
		).rejects.toMatchObject({ code: "forbidden" });
	});

	test("extra_time creates the override and its session together", async () => {
		consumedToday(60);
		const request = await kit.core.createRequest(h.child, {
			requestType: "extra_time",
			activityId: h.gameId,
			requestedMinutes: 20,
			reason: "Es sábado",
		});
		const result = await kit.core.approveRequest(h.dad, {
			requestId: request.id,
			approvedMinutes: 15,
		});
		expect(result.override).toMatchObject({
			requestId: request.id,
			extraMinutes: 15,
			reason: "Es sábado",
			grantedByParentId: h.dad.parentId,
		});
		expect(result.session.overrideId).toBe(result.override?.id ?? "");
		expect(result.session.plannedDurationSeconds).toBe(15 * 60);
	});
});

describe("approveRequest to start later", () => {
	const SIX_PM = new Date("2026-10-21T18:00:00-05:00");

	test("schedules the session and its start job", async () => {
		const request = await askToStart(40);
		const result = await kit.core.approveRequest(h.mom, {
			requestId: request.id,
			approvedMinutes: 40,
			startAt: SIX_PM,
		});
		expect(result.session.status).toBe("scheduled");
		expect(result.session.scheduledStartAt?.toISOString()).toBe(
			SIX_PM.toISOString(),
		);
		expect(result.session.startedAt).toBeNull();
		expect(kit.jobs.scheduled.map((job) => job.alertType)).toEqual(["start"]);
		expect(kit.notifier.sent.at(-1)?.message.body).toBe(
			"40 min de Juego. Empieza a las 18:00.",
		);

		// Scheduled sessions do not consume.
		const balance = await kit.core.getChildBalance(h.child, {
			childId: h.childId,
		});
		expect(balance.balances[0]?.availableSeconds).toBe(60 * 60);
	});

	test("the start time must be later today", async () => {
		const request = await askToStart(40);
		for (const startAt of [
			new Date("2026-10-21T14:00:00-05:00"), // past
			new Date("2026-10-22T00:00:00-05:00"), // tomorrow
		]) {
			await expect(
				kit.core.approveRequest(h.mom, {
					requestId: request.id,
					approvedMinutes: 40,
					startAt,
				}),
			).rejects.toMatchObject({ code: "invalid_start_time" });
		}
	});
});

describe("rejectRequest and cancelRequest", () => {
	test("a parent rejects with a note and the child is told", async () => {
		const request = await askToStart(30);
		kit.notifier.clear();
		const rejected = await kit.core.rejectRequest(h.dad, {
			requestId: request.id,
			note: "Primero los deberes",
		});
		expect(rejected).toMatchObject({
			status: "rejected",
			responseNote: "Primero los deberes",
			resolvedByParentId: h.dad.parentId,
		});
		expect(kit.notifier.sent[0]).toMatchObject({
			to: [h.auth.child],
			message: { kind: "request_rejected", body: "Primero los deberes" },
		});
	});

	test("the child cancels their pending request", async () => {
		const request = await askToStart(30);
		const cancelled = await kit.core.cancelRequest(h.child, {
			requestId: request.id,
		});
		expect(cancelled.status).toBe("cancelled");
		await expect(
			kit.core.cancelRequest(h.child, { requestId: request.id }),
		).rejects.toMatchObject({ code: "request_already_resolved" });
	});

	test("parents do not cancel, they reject", async () => {
		const request = await askToStart(30);
		await expect(
			kit.core.cancelRequest(h.mom, { requestId: request.id }),
		).rejects.toMatchObject({ code: "forbidden" });
	});

	test("a child cannot cancel someone else's request", async () => {
		const request = await askToStart(30);
		await expect(
			kit.core.cancelRequest(
				{ kind: "child", childId: "sibling", familyId: h.familyId },
				{ requestId: request.id },
			),
		).rejects.toMatchObject({ code: "request_not_found" });
	});
});
