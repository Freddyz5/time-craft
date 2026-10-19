// Drizzle only validates relations() when a query uses them, so this walks
// each one (both directions where both are defined).
import { beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
	childRequests,
	families,
	quotaOverrides,
	quotaPolicies,
	sessionAlerts,
	sessionPauses,
	sessions,
	taskReports,
} from "./schema";
import { createFamily, createTestDb, first, type TestDb } from "./testing";

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();
});

test("relations resolve in both directions", async () => {
	const f = await createFamily(db);
	const request = first(
		await db
			.insert(childRequests)
			.values({
				childId: f.child.id,
				requestType: "extra_time",
				activityId: f.tv.id,
				requestedMinutes: 20,
				reason: "Película",
				status: "approved",
				approvedMinutes: 15,
				expiresAt: new Date(),
				resolvedByParentId: f.dad.id,
				resolvedAt: new Date(),
			})
			.returning(),
	);
	const override = first(
		await db
			.insert(quotaOverrides)
			.values({
				childId: f.child.id,
				requestId: request.id,
				grantedByParentId: f.dad.id,
				extraMinutes: 15,
				reason: "Película",
			})
			.returning(),
	);
	const session = first(
		await db
			.insert(sessions)
			.values({
				childId: f.child.id,
				activityId: f.tv.id,
				requestId: request.id,
				overrideId: override.id,
				status: "finished",
				startedAt: new Date(Date.now() - 20 * 60_000),
				plannedDurationSeconds: 900,
				endedAt: new Date(),
				endReason: "stopped_early",
				consumedSeconds: 600,
				startedByParentId: f.dad.id,
				endedByParentId: f.mom.id,
			})
			.returning(),
	);
	await db.insert(sessionPauses).values({
		sessionId: session.id,
		pausedAt: new Date(Date.now() - 10 * 60_000),
		resumedAt: new Date(Date.now() - 5 * 60_000),
		pausedByParentId: f.mom.id,
		resumedByParentId: f.dad.id,
	});
	await db.insert(sessionAlerts).values({
		sessionId: session.id,
		alertType: "end",
		scheduledAt: new Date(),
	});
	await db.insert(quotaPolicies).values({
		childId: f.child.id,
		activityId: null,
		dailyLimitMinutes: 60,
		weeklyLimitMinutes: 300,
		createdByParentId: f.mom.id,
	});
	await db.insert(taskReports).values({
		childId: f.child.id,
		bonusTaskId: f.homework.id,
		status: "approved",
		awardedMinutes: 15,
		reviewedByParentId: f.mom.id,
	});

	const loaded = await db.query.sessions.findFirst({
		where: eq(sessions.id, session.id),
		with: {
			child: true,
			activity: true,
			request: { with: { resolvedBy: true, session: true, override: true } },
			override: { with: { grantedBy: true, request: true, sessions: true } },
			startedBy: true,
			endedBy: true,
			pauses: { with: { pausedBy: true, resumedBy: true, session: true } },
			alerts: { with: { session: true } },
		},
	});
	expect(loaded?.child.id).toBe(f.child.id);
	expect(loaded?.activity.code).toBe("tv");
	expect(loaded?.request?.resolvedBy?.id).toBe(f.dad.id);
	expect(loaded?.request?.session?.id).toBe(session.id);
	expect(loaded?.request?.override?.id).toBe(override.id);
	expect(loaded?.override?.grantedBy.id).toBe(f.dad.id);
	expect(loaded?.override?.sessions.map((s) => s.id)).toEqual([session.id]);
	expect(loaded?.startedBy.id).toBe(f.dad.id);
	expect(loaded?.endedBy?.id).toBe(f.mom.id);
	expect(loaded?.pauses[0]?.pausedBy.id).toBe(f.mom.id);
	expect(loaded?.pauses[0]?.resumedBy?.id).toBe(f.dad.id);
	expect(loaded?.alerts[0]?.session.id).toBe(session.id);

	const family = await db.query.families.findFirst({
		where: eq(families.id, f.family.id),
		with: {
			parents: {
				with: {
					authUser: { with: { parent: true } },
					createdQuotaPolicies: true,
					resolvedRequests: true,
					grantedOverrides: true,
					startedSessions: true,
					endedSessions: true,
					pausesStarted: true,
					pausesResumed: true,
					createdBonusTasks: true,
					reviewedTaskReports: true,
				},
			},
			children: {
				with: {
					authUser: { with: { child: true } },
					quotaPolicies: { with: { activity: true, createdBy: true } },
					requests: { with: { activity: true } },
					overrides: true,
					sessions: true,
					taskReports: { with: { bonusTask: true, reviewedBy: true } },
				},
			},
			activities: {
				with: { quotaPolicies: true, requests: true, sessions: true },
			},
			bonusTasks: { with: { createdBy: true, reports: true } },
		},
	});
	const dad = family?.parents.find((parent) => parent.id === f.dad.id);
	const mom = family?.parents.find((parent) => parent.id === f.mom.id);
	expect(dad?.authUser.parent?.id).toBe(f.dad.id);
	expect(dad?.startedSessions).toHaveLength(1);
	expect(dad?.resolvedRequests).toHaveLength(1);
	expect(dad?.grantedOverrides).toHaveLength(1);
	expect(dad?.pausesResumed).toHaveLength(1);
	expect(mom?.endedSessions).toHaveLength(1);
	expect(mom?.pausesStarted).toHaveLength(1);
	expect(mom?.createdQuotaPolicies).toHaveLength(1);
	expect(mom?.createdBonusTasks).toHaveLength(2);
	expect(mom?.reviewedTaskReports).toHaveLength(1);

	const [child] = family?.children ?? [];
	expect(child?.authUser.child?.id).toBe(f.child.id);
	expect(child?.quotaPolicies[0]?.activity).toBeNull();
	expect(child?.requests).toHaveLength(1);
	expect(child?.overrides).toHaveLength(1);
	expect(child?.sessions).toHaveLength(1);
	expect(child?.taskReports[0]?.bonusTask.id).toBe(f.homework.id);
	expect(
		family?.activities.find((a) => a.code === "tv")?.sessions,
	).toHaveLength(1);
	expect(family?.bonusTasks).toHaveLength(2);
});
