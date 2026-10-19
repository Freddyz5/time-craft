// The rules the database enforces on its own (CHECKs and partial unique
// indexes), run against the real migrations on PGlite.
import { beforeAll, describe, expect, test } from "bun:test";
import { DrizzleQueryError, eq } from "drizzle-orm";
import {
	childRequests,
	type NewChildRequest,
	type NewSession,
	quotaPolicies,
	sessionPauses,
	sessions,
	taskReports,
} from "./schema";
import {
	createFamily,
	createTestDb,
	type FamilyFixture,
	first,
	type TestDb,
} from "./testing";

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();
});

async function expectViolation(
	query: PromiseLike<unknown>,
	constraint: string,
) {
	const error = await query.then(
		() => undefined,
		(error: unknown) => error,
	);
	expect(error).toBeInstanceOf(DrizzleQueryError);
	expect((error as DrizzleQueryError).cause).toMatchObject({ constraint });
}

const minutesFromNow = (minutes: number) =>
	new Date(Date.now() + minutes * 60_000);

function newRequest(
	f: FamilyFixture,
	values: Partial<NewChildRequest> = {},
): NewChildRequest {
	return {
		childId: f.child.id,
		requestType: "start",
		activityId: f.game.id,
		requestedMinutes: 30,
		expiresAt: minutesFromNow(15),
		...values,
	};
}

// A running session unless overridden.
function newSession(
	f: FamilyFixture,
	values: Partial<NewSession> = {},
): NewSession {
	return {
		childId: f.child.id,
		activityId: f.game.id,
		status: "running",
		startedAt: new Date(),
		plannedDurationSeconds: 3600,
		startedByParentId: f.mom.id,
		...values,
	};
}

const scheduled = {
	status: "scheduled",
	scheduledStartAt: minutesFromNow(60),
	startedAt: null,
} satisfies Partial<NewSession>;

const finished = {
	status: "finished",
	startedAt: minutesFromNow(-90),
	endedAt: minutesFromNow(-30),
	endReason: "completed",
	consumedSeconds: 3600,
	endedByParentId: null,
} satisfies Partial<NewSession>;

describe("child_requests", () => {
	test("a child cannot have a second pending request", async () => {
		const f = await createFamily(db);
		await db.insert(childRequests).values(newRequest(f));

		await expectViolation(
			db.insert(childRequests).values(newRequest(f, { activityId: f.tv.id })),
			"uq_requests_one_pending",
		);
	});

	test("a request that is no longer pending does not block a new one", async () => {
		const f = await createFamily(db);
		const request = first(
			await db.insert(childRequests).values(newRequest(f)).returning(),
		);
		await db
			.update(childRequests)
			.set({ status: "expired" })
			.where(eq(childRequests.id, request.id));

		await db.insert(childRequests).values(newRequest(f));
	});

	test("extra_time requires a reason", async () => {
		const f = await createFamily(db);
		const extraTime = { requestType: "extra_time" } as const;

		await expectViolation(
			db.insert(childRequests).values(newRequest(f, extraTime)),
			"chk_requests_reason",
		);
		await expectViolation(
			db
				.insert(childRequests)
				.values(newRequest(f, { ...extraTime, reason: "   " })),
			"chk_requests_reason",
		);
		await db
			.insert(childRequests)
			.values(newRequest(f, { ...extraTime, reason: "Terminé los deberes" }));
	});
});

describe("sessions", () => {
	test.each([
		{ status: "scheduled", values: scheduled },
		{ status: "running", values: {} },
		{ status: "paused", values: { status: "paused" } },
	] as const)("a $status session blocks a second one", async ({ values }) => {
		const f = await createFamily(db);
		await db.insert(sessions).values(newSession(f, values));

		await expectViolation(
			db.insert(sessions).values(newSession(f, { activityId: f.tv.id })),
			"uq_sessions_one_active",
		);
	});

	test("finished and cancelled sessions do not block a new one", async () => {
		const f = await createFamily(db);
		await db
			.insert(sessions)
			.values(newSession(f, { ...finished, endedByParentId: f.mom.id }));
		await db.insert(sessions).values(
			newSession(f, {
				...scheduled,
				status: "cancelled",
				endedAt: new Date(),
				endedByParentId: f.dad.id,
			}),
		);

		await db.insert(sessions).values(newSession(f));
	});

	test("a scheduled session cannot have started_at", async () => {
		const f = await createFamily(db);

		await expectViolation(
			db
				.insert(sessions)
				.values(newSession(f, { ...scheduled, startedAt: new Date() })),
			"chk_sessions_start",
		);
	});

	test("a running session needs started_at", async () => {
		const f = await createFamily(db);

		await expectViolation(
			db.insert(sessions).values(newSession(f, { startedAt: null })),
			"chk_sessions_start",
		);
	});

	test("a finished session needs consumed_seconds", async () => {
		const f = await createFamily(db);

		await expectViolation(
			db.insert(sessions).values(
				newSession(f, {
					...finished,
					endedByParentId: f.mom.id,
					consumedSeconds: null,
				}),
			),
			"chk_sessions_end",
		);
	});

	test("a cancelled session needs the parent who cancelled it", async () => {
		const f = await createFamily(db);

		await expectViolation(
			db.insert(sessions).values(
				newSession(f, {
					...scheduled,
					status: "cancelled",
					endedAt: new Date(),
				}),
			),
			"chk_sessions_end",
		);
	});

	test("an auto-closed session needs no parent, a completed one does", async () => {
		const f = await createFamily(db);

		await expectViolation(
			db.insert(sessions).values(newSession(f, finished)),
			"chk_sessions_ender",
		);
		await db
			.insert(sessions)
			.values(newSession(f, { ...finished, endReason: "auto_closed" }));
	});
});

describe("session_pauses", () => {
	test("a session cannot have a second open pause", async () => {
		const f = await createFamily(db);
		const session = first(
			await db
				.insert(sessions)
				.values(newSession(f, { status: "paused" }))
				.returning(),
		);
		const pause = { sessionId: session.id, pausedByParentId: f.mom.id };
		await db.insert(sessionPauses).values(pause);

		await expectViolation(
			db.insert(sessionPauses).values({ ...pause, pausedByParentId: f.dad.id }),
			"uq_pauses_one_open",
		);
	});

	test("a resumed pause does not block a new one", async () => {
		const f = await createFamily(db);
		const session = first(
			await db.insert(sessions).values(newSession(f)).returning(),
		);
		const pause = { sessionId: session.id, pausedByParentId: f.mom.id };
		await db.insert(sessionPauses).values({
			...pause,
			pausedAt: minutesFromNow(-20),
			resumedAt: minutesFromNow(-10),
			resumedByParentId: f.mom.id,
		});

		await db.insert(sessionPauses).values(pause);
	});
});

describe("task_reports", () => {
	test("a child cannot have a second pending report of the same task", async () => {
		const f = await createFamily(db);
		const report = { childId: f.child.id, bonusTaskId: f.homework.id };
		await db.insert(taskReports).values(report);

		await expectViolation(
			db.insert(taskReports).values({ ...report, note: "Otra vez" }),
			"uq_reports_one_pending",
		);
	});

	test("another task, or a reviewed report, does not block a new one", async () => {
		const f = await createFamily(db);
		const report = { childId: f.child.id, bonusTaskId: f.homework.id };
		await db.insert(taskReports).values({
			...report,
			status: "approved",
			awardedMinutes: 15,
			reviewedByParentId: f.dad.id,
			reviewedAt: new Date(),
		});
		await db
			.insert(taskReports)
			.values({ ...report, bonusTaskId: f.reading.id });

		await db.insert(taskReports).values(report);
	});
});

describe("quota_policies", () => {
	const newPolicy = (f: FamilyFixture, activityId: string | null) => ({
		childId: f.child.id,
		activityId,
		dailyLimitMinutes: 60,
		weeklyLimitMinutes: 300,
		createdByParentId: f.mom.id,
	});

	test("a child cannot have two current policies for the same activity", async () => {
		const f = await createFamily(db);
		await db.insert(quotaPolicies).values(newPolicy(f, f.game.id));

		await expectViolation(
			db.insert(quotaPolicies).values(newPolicy(f, f.game.id)),
			"uq_quota_current",
		);
	});

	test("a child cannot have two current global policies", async () => {
		const f = await createFamily(db);
		await db.insert(quotaPolicies).values(newPolicy(f, null));

		await expectViolation(
			db.insert(quotaPolicies).values(newPolicy(f, null)),
			"uq_quota_current",
		);
	});

	test("closed policies and other activities do not collide", async () => {
		const f = await createFamily(db);
		await db
			.insert(quotaPolicies)
			.values({ ...newPolicy(f, null), validTo: new Date() });
		await db.insert(quotaPolicies).values(newPolicy(f, null));
		await db.insert(quotaPolicies).values(newPolicy(f, f.game.id));

		await db.insert(quotaPolicies).values(newPolicy(f, f.tv.id));
	});
});
