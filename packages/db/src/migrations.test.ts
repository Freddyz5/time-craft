// Data migrations, run again on purpose against families in every state they
// can find: running one twice must change nothing.
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { activities, quotaPolicies } from "./schema";
import {
	createFamily,
	createTestDb,
	type FamilyFixture,
	type TestDb,
} from "./testing";

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();
});

function migration(tag: string) {
	return readFileSync(
		join(import.meta.dirname, "../migrations", `${tag}.sql`),
		"utf8",
	);
}

describe("0007_general_quota_members", () => {
	const run = () =>
		db.execute(sql.raw(migration("0007_general_quota_members")));

	const policy = (
		f: FamilyFixture,
		activityId: string | null,
		dailyLimitMinutes = 60,
	) =>
		db.insert(quotaPolicies).values({
			childId: f.child.id,
			activityId,
			dailyLimitMinutes,
			weeklyLimitMinutes: 300,
			weeklyBonusCapMinutes: 30,
			warningMinutes: 10,
			allowedDays: [1, 2, 3, 4, 5],
			graceMinutes: 2,
			createdByParentId: f.mom.id,
		});

	// [activity, daily limit] of each current policy, "general" first.
	async function current(f: FamilyFixture) {
		const rows = await db
			.select()
			.from(quotaPolicies)
			.where(
				and(
					eq(quotaPolicies.childId, f.child.id),
					isNull(quotaPolicies.validTo),
				),
			);
		const name = (id: string | null) =>
			id === null ? "general" : id === f.game.id ? "game" : "tv";
		return rows
			.map((row) => [name(row.activityId), row.dailyLimitMinutes])
			.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
	}

	test("closes a general quota no activity draws from", async () => {
		const f = await createFamily(db);
		await policy(f, null);
		await policy(f, f.game.id, 90);
		await policy(f, f.tv.id, 30);
		await run();
		expect(await current(f)).toEqual([
			["game", 90],
			["tv", 30],
		]);
		const all = await db
			.select()
			.from(quotaPolicies)
			.where(eq(quotaPolicies.childId, f.child.id));
		expect(all).toHaveLength(3);
	});

	test("turns a general quota with one activity into that activity's own", async () => {
		const f = await createFamily(db);
		await policy(f, null, 120);
		await policy(f, f.tv.id, 30);
		await run();
		expect(await current(f)).toEqual([
			["game", 120],
			["tv", 30],
		]);
		const [game] = await db
			.select()
			.from(quotaPolicies)
			.where(
				and(
					eq(quotaPolicies.activityId, f.game.id),
					isNull(quotaPolicies.validTo),
				),
			);
		expect(game).toMatchObject({
			weeklyLimitMinutes: 300,
			weeklyBonusCapMinutes: 30,
			warningMinutes: 10,
			allowedDays: [1, 2, 3, 4, 5],
			graceMinutes: 2,
			createdByParentId: f.mom.id,
		});
	});

	test("an inactive activity does not count", async () => {
		const f = await createFamily(db);
		await db
			.update(activities)
			.set({ isActive: false })
			.where(eq(activities.id, f.tv.id));
		await policy(f, null);
		await policy(f, f.game.id, 90);
		await run();
		expect(await current(f)).toEqual([["game", 90]]);
	});

	test("leaves a general quota shared by two activities, and runs twice", async () => {
		const f = await createFamily(db);
		await policy(f, null);
		await run();
		await run();
		expect(await current(f)).toEqual([["general", 60]]);
	});
});
