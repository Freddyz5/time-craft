// Test kit: in-memory ports and a ready-made household. Used by core's tests,
// and available to the api's tests as @time-craft/core/testing.
import { type Core, type CoreDeps, createCore } from "../application";
import type { ChildActor, ParentActor } from "../domain/actor";
import type { WeekDay } from "../domain/family";
import type { QuotaPolicy } from "../domain/policy";
import { InMemoryDatabase } from "./database";
import {
	FakeIdentityService,
	FakeJobScheduler,
	FakeNotifier,
	FakeRecoveryCodes,
	FixedClock,
	SequentialIds,
} from "./fakes";

export * from "./database";
export * from "./fakes";

export interface TestKit {
	core: Core;
	deps: CoreDeps;
	db: InMemoryDatabase;
	clock: FixedClock;
	jobs: FakeJobScheduler;
	notifier: FakeNotifier;
	identity: FakeIdentityService;
	recoveryCodes: FakeRecoveryCodes;
}

export function createTestKit(now: Date | string): TestKit {
	const db = new InMemoryDatabase();
	const clock = new FixedClock(now);
	const jobs = new FakeJobScheduler();
	const notifier = new FakeNotifier();
	const identity = new FakeIdentityService();
	const recoveryCodes = new FakeRecoveryCodes();
	const deps: CoreDeps = {
		uow: db,
		clock,
		ids: new SequentialIds(),
		jobs,
		notifier,
		identity,
		recoveryCodes,
	};
	return {
		core: createCore(deps),
		deps,
		db,
		clock,
		jobs,
		notifier,
		identity,
		recoveryCodes,
	};
}

export interface Household {
	familyId: string;
	mom: ParentActor;
	dad: ParentActor;
	child: ChildActor;
	childId: string;
	gameId: string;
	tvId: string;
	auth: { mom: string; dad: string; child: string };
}

export interface HouseholdOptions {
	// Distinguishes several households in one database.
	prefix?: string;
	timezone?: string;
	weekStartDay?: WeekDay;
	requestExpiryMinutes?: number;
	autoCloseAfterMinutes?: number;
	// Global policy. null: no policy.
	policy?: Partial<
		Pick<
			QuotaPolicy,
			| "dailyLimitMinutes"
			| "weeklyLimitMinutes"
			| "weeklyBonusCapMinutes"
			| "carryOverExcess"
			| "warningMinutes"
		>
	> | null;
}

// Family with two parents, one child, the game and TV activities and, by
// default, a global policy of 60 min a day and 300 a week.
export function seedHousehold(
	kit: TestKit,
	options: HouseholdOptions = {},
): Household {
	const p = options.prefix ?? "";
	const familyId = `${p}family`;
	const auth = {
		mom: `${p}auth-mom`,
		dad: `${p}auth-dad`,
		child: `${p}auth-child`,
	};
	const { db, identity } = kit;
	db.set("families", {
		id: familyId,
		name: "Casa",
		timezone: options.timezone ?? "America/Guayaquil",
		weekStartDay: options.weekStartDay ?? 1,
		requestExpiryMinutes: options.requestExpiryMinutes ?? 15,
		autoCloseAfterMinutes: options.autoCloseAfterMinutes ?? 30,
		recoveryCodeHash: null,
		recoveryCodeCreatedAt: null,
	});
	for (const [key, name] of [
		["mom", "Mamá"],
		["dad", "Papá"],
	] as const) {
		db.set("parents", {
			id: `${p}parent-${key}`,
			familyId,
			authUserId: auth[key],
			name,
		});
		identity.addUser({
			id: auth[key],
			name,
			email: `${p}${key}@example.com`,
			username: null,
			password: "old-password",
		});
	}
	const childId = `${p}child`;
	db.set("children", {
		id: childId,
		familyId,
		authUserId: auth.child,
		name: "Mateo",
		avatar: null,
		failedPinAttempts: 0,
		lockedUntil: null,
		createdAt: kit.clock.now(),
	});
	identity.addUser({
		id: auth.child,
		name: "Mateo",
		email: `${p}mateo@hijos.timecraft.local`,
		username: `${p}mateo`,
		password: "123456",
	});
	const gameId = `${p}activity-game`;
	const tvId = `${p}activity-tv`;
	db.set("activities", {
		id: gameId,
		familyId,
		code: "game",
		name: "Juego",
		isActive: true,
	});
	db.set("activities", {
		id: tvId,
		familyId,
		code: "tv",
		name: "TV",
		isActive: true,
	});
	if (options.policy !== null) {
		db.set("policies", {
			id: `${p}policy-global`,
			childId,
			activityId: null,
			dailyLimitMinutes: 60,
			weeklyLimitMinutes: 300,
			weeklyBonusCapMinutes: 60,
			carryOverExcess: false,
			warningMinutes: 5,
			...options.policy,
			validFrom: new Date("2026-01-01T00:00:00Z"),
			validTo: null,
			createdByParentId: `${p}parent-mom`,
			createdAt: new Date("2026-01-01T00:00:00Z"),
		});
	}
	return {
		familyId,
		mom: { kind: "parent", parentId: `${p}parent-mom`, familyId },
		dad: { kind: "parent", parentId: `${p}parent-dad`, familyId },
		child: { kind: "child", childId, familyId },
		childId,
		gameId,
		tvId,
		auth,
	};
}
