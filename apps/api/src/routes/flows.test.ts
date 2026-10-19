// End to end over HTTP: the child asks, a parent approves (now or later), the
// timer runs, QStash calls back. Fake QStash and Web Push record what the api
// asked for.
import { beforeEach, describe, expect, test } from "bun:test";
import { sessionAlerts } from "@time-craft/db";
import { eq } from "drizzle-orm";
import { createTestApp, signJob, type TestApp } from "../testing/harness";

let t: TestApp;
let parent: string;
let child: string;

beforeEach(async () => {
	t = await createTestApp();
	parent = await t.signInParent();
	child = await t.signInChild();
});

interface SessionBody {
	serverTime: string;
	session: {
		id: string;
		status: string;
		plannedDurationSeconds: number;
		consumedSeconds: number | null;
		endReason: string | null;
	};
}

async function json<T>(response: Response, status: number): Promise<T> {
	const text = await response.text();
	if (response.status !== status) {
		throw new Error(`Expected ${status}, got ${response.status}: ${text}`);
	}
	return JSON.parse(text) as T;
}

async function askToStart(minutes: number) {
	const response = await t.request("POST", "/api/requests", {
		cookie: child,
		json: {
			requestType: "start",
			activityId: t.ids.gameId,
			requestedMinutes: minutes,
		},
	});
	return (await json<{ request: { id: string } }>(response, 201)).request;
}

function approve(requestId: string, body: Record<string, unknown>) {
	return t.request("POST", `/api/requests/${requestId}/approve`, {
		cookie: parent,
		json: body,
	});
}

const sessionCommand = (sessionId: string, command: string, body?: object) =>
	t.request("POST", `/api/sessions/${sessionId}/${command}`, {
		cookie: parent,
		json: body ?? {},
	});

async function alertsOf(sessionId: string) {
	return t.db
		.select()
		.from(sessionAlerts)
		.where(eq(sessionAlerts.sessionId, sessionId));
}

async function available(): Promise<number> {
	const response = await t.request(
		"GET",
		`/api/children/${t.ids.childId}/balance`,
		{ cookie: child },
	);
	const view = await json<{ balances: { availableSeconds: number }[] }>(
		response,
		200,
	);
	return (view.balances[0]?.availableSeconds ?? 0) / 60;
}

describe("request → approve now → pause → resume → stop", () => {
	test("the whole timer, with its jobs and pushes", async () => {
		const request = await askToStart(30);
		expect(t.notifier.kinds()).toEqual(["request_created"]);

		const pending = await t.request("GET", "/api/requests", { cookie: parent });
		expect(
			(await json<{ requests: { id: string }[] }>(pending, 200)).requests,
		).toMatchObject([{ id: request.id }]);

		// Fewer minutes than asked.
		const approved = await json<
			SessionBody & { request: { status: string }; override: null }
		>(await approve(request.id, { approvedMinutes: 20, note: "Solo 20" }), 200);
		expect(approved.request.status).toBe("approved");
		expect(approved.override).toBeNull();
		expect(approved.serverTime).toBe("2026-10-21T20:00:00.000Z");
		const sessionId = approved.session.id;
		expect(approved.session).toMatchObject({
			status: "running",
			plannedDurationSeconds: 20 * 60,
		});
		expect(t.jobs.active().map((job) => job.alertType)).toEqual([
			"warning",
			"end",
			"auto_close",
		]);
		expect(t.notifier.kinds()).toContain("request_approved");

		// The child watches it live; the running session already counts.
		t.clock.advanceMinutes(5);
		const live = await t.request(
			"GET",
			`/api/children/${t.ids.childId}/live-session`,
			{ cookie: child },
		);
		expect(
			await json<{ serverTime: string; live: object }>(live, 200),
		).toMatchObject({
			serverTime: "2026-10-21T20:05:00.000Z",
			live: { elapsedSeconds: 300, remainingSeconds: 900 },
		});
		expect(await available()).toBe(55);

		// A pause cancels the jobs and stops the clock.
		const paused = await json<SessionBody>(
			await sessionCommand(sessionId, "pause", { reason: "Cena" }),
			200,
		);
		expect(paused.session.status).toBe("paused");
		expect(t.jobs.active()).toEqual([]);
		expect(
			(await alertsOf(sessionId)).every((alert) => alert.cancelledAt !== null),
		).toBe(true);

		t.clock.advanceMinutes(10);
		const resumed = await json<SessionBody>(
			await sessionCommand(sessionId, "resume"),
			200,
		);
		expect(resumed.session.status).toBe("running");
		const end = t.jobs.active().find((job) => job.alertType === "end");
		// 15 minutes left after the pause.
		expect(end?.runAt.toISOString()).toBe("2026-10-21T20:30:00.000Z");

		t.clock.advanceMinutes(15);
		const stopped = await json<SessionBody>(
			await sessionCommand(sessionId, "stop"),
			200,
		);
		expect(stopped.session).toMatchObject({
			status: "finished",
			endReason: "completed",
			consumedSeconds: 20 * 60,
		});
		expect(t.jobs.active()).toEqual([]);
		expect(await available()).toBe(40);
	});
});

describe("approve to start later", () => {
	test("QStash's start job starts it, once", async () => {
		const request = await askToStart(30);
		const approved = await json<SessionBody>(
			await approve(request.id, {
				approvedMinutes: 30,
				startAt: "2026-10-21T18:00:00-05:00",
			}),
			200,
		);
		expect(approved.session.status).toBe("scheduled");
		const [start] = t.jobs.active();
		expect(start).toMatchObject({ alertType: "start" });
		expect(start?.runAt.toISOString()).toBe("2026-10-21T23:00:00.000Z");

		t.clock.set("2026-10-21T18:00:00-05:00");
		t.notifier.clear();
		const delivered = await t.deliverJob(start?.alertId ?? "");
		expect(await json<{ outcome: object }>(delivered, 200)).toEqual({
			outcome: {
				status: "handled",
				alertType: "start",
				sessionId: approved.session.id,
			},
		});
		expect(t.notifier.kinds()).toEqual(["session_ready"]);

		const live = await t.request(
			"GET",
			`/api/children/${t.ids.childId}/live-session`,
			{ cookie: parent },
		);
		expect(await json<object>(live, 200)).toMatchObject({
			live: { session: { status: "running" }, remainingSeconds: 30 * 60 },
		});

		// QStash retries: the second delivery changes nothing.
		const again = await t.deliverJob(start?.alertId ?? "");
		expect(await json<object>(again, 200)).toEqual({
			outcome: { status: "ignored", reason: "already_sent" },
		});
	});

	test("a parent can start it early or cancel it", async () => {
		const request = await askToStart(30);
		const approved = await json<SessionBody>(
			await approve(request.id, {
				approvedMinutes: 30,
				startAt: "2026-10-21T18:00:00-05:00",
			}),
			200,
		);
		const started = await json<SessionBody>(
			await sessionCommand(approved.session.id, "start"),
			200,
		);
		expect(started.session.status).toBe("running");
		expect(t.jobs.active().map((job) => job.alertType)).toEqual([
			"warning",
			"end",
			"auto_close",
		]);

		const direct = await t.request("POST", "/api/sessions", {
			cookie: parent,
			json: {
				childId: t.ids.childId,
				activityId: t.ids.tvId,
				minutes: 10,
				startAt: "2026-10-21T19:00:00-05:00",
			},
		});
		// One open session per child.
		expect(await json<object>(direct, 409)).toMatchObject({
			error: { code: "session_already_open" },
		});
	});

	test("the start time must be later today", async () => {
		const request = await askToStart(30);
		const response = await approve(request.id, {
			approvedMinutes: 30,
			startAt: "2026-10-22T10:00:00-05:00",
		});
		expect(await json<object>(response, 400)).toMatchObject({
			error: { code: "invalid_start_time" },
		});
	});
});

describe("a forgotten session", () => {
	test("QStash's auto_close job closes it and tells the parents", async () => {
		const response = await t.request("POST", "/api/sessions", {
			cookie: parent,
			json: { childId: t.ids.childId, activityId: t.ids.gameId, minutes: 20 },
		});
		const { session } = await json<SessionBody>(response, 201);
		const autoClose = t.jobs
			.active()
			.find((job) => job.alertType === "auto_close");
		expect(autoClose?.runAt.toISOString()).toBe("2026-10-21T20:50:00.000Z");

		t.clock.set("2026-10-21T15:50:00-05:00");
		t.notifier.clear();
		const delivered = await t.deliverJob(autoClose?.alertId ?? "");
		expect(await json<object>(delivered, 200)).toMatchObject({
			outcome: { status: "handled", alertType: "auto_close" },
		});
		expect(t.notifier.kinds()).toEqual(["session_auto_closed"]);
		const history = await t.request(
			"GET",
			`/api/children/${t.ids.childId}/history`,
			{ cookie: parent },
		);
		expect(await json<object>(history, 200)).toMatchObject({
			sessions: [
				{
					id: session.id,
					status: "finished",
					endReason: "auto_closed",
					consumedSeconds: 50 * 60,
				},
			],
			usageByActivity: [{ activityId: t.ids.gameId, consumedSeconds: 3000 }],
		});
	});
});

describe("extra time", () => {
	test("only with the quota used up, and it creates an override", async () => {
		const extra = {
			requestType: "extra_time",
			activityId: t.ids.gameId,
			requestedMinutes: 15,
			reason: "Terminé los deberes",
		};
		const tooEarly = await t.request("POST", "/api/requests", {
			cookie: child,
			json: extra,
		});
		expect(await json<object>(tooEarly, 422)).toMatchObject({
			error: { code: "quota_not_exhausted" },
		});

		// A whole hour today uses up the daily limit.
		const { session } = await json<SessionBody>(
			await t.request("POST", "/api/sessions", {
				cookie: parent,
				json: { childId: t.ids.childId, activityId: t.ids.gameId, minutes: 60 },
			}),
			201,
		);
		t.clock.advanceMinutes(60);
		await json<SessionBody>(await sessionCommand(session.id, "stop"), 200);

		const start = await t.request("POST", "/api/requests", {
			cookie: child,
			json: { ...extra, requestType: "start" },
		});
		expect(await json<object>(start, 422)).toMatchObject({
			error: { code: "quota_exhausted" },
		});

		const request = (
			await json<{ request: { id: string } }>(
				await t.request("POST", "/api/requests", {
					cookie: child,
					json: extra,
				}),
				201,
			)
		).request;
		const approved = await json<{ override: object; session: object }>(
			await approve(request.id, { approvedMinutes: 10 }),
			200,
		);
		expect(approved.override).toMatchObject({
			extraMinutes: 10,
			reason: "Terminé los deberes",
		});
		expect(approved.session).toMatchObject({
			status: "running",
			plannedDurationSeconds: 600,
		});
	});
});

describe("concurrency", () => {
	test("if both parents approve, the second one gets a conflict", async () => {
		const request = await askToStart(30);
		const dad = await t.signInParent("dad");
		await json<object>(await approve(request.id, { approvedMinutes: 30 }), 200);
		const second = await t.request(
			"POST",
			`/api/requests/${request.id}/approve`,
			{ cookie: dad, json: { approvedMinutes: 30 } },
		);
		expect(await json<object>(second, 409)).toMatchObject({
			error: { code: "request_already_resolved" },
		});
	});
});

describe("the QStash callback", () => {
	test("refuses a missing or wrong signature with 401", async () => {
		const body = JSON.stringify({ alertId: crypto.randomUUID() });
		const post = (headers: Record<string, string>) =>
			t.app.request("/internal/jobs", {
				method: "POST",
				headers: { "content-type": "application/json", ...headers },
				body,
			});

		const missing = await post({});
		expect(await json<object>(missing, 401)).toEqual({
			error: { code: "invalid_signature", message: "Invalid signature" },
		});
		const wrongKey = await post({
			"upstash-signature": signJob(body, "sig_someone_else"),
		});
		expect(wrongKey.status).toBe(401);
		const otherBody = await post({
			"upstash-signature": signJob(JSON.stringify({ alertId: "x" })),
		});
		expect(otherBody.status).toBe(401);
	});

	test("accepts the next signing key, and ignores unknown alerts", async () => {
		const body = JSON.stringify({ alertId: crypto.randomUUID() });
		const response = await t.app.request("/internal/jobs", {
			method: "POST",
			headers: { "upstash-signature": signJob(body, "sig_test_next") },
			body,
		});
		expect(await json<object>(response, 200)).toEqual({
			outcome: { status: "ignored", reason: "alert_not_found" },
		});
	});
});
