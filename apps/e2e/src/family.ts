// The test family: two parents with a password, the child (username + PIN),
// the game and TV activities, a global policy, two bonus tasks and the
// recovery code. Built with the api's own seed and core, so it is what
// `bun run db:seed` makes, on a database the guard accepted (db.ts).
//
// Every family gets a fresh id in names, emails and the username, so runs
// never collide, and its time zone is one where it is about noon: nothing
// rolls over to another day (or week) while the tests run. Parents' emails
// use E2E_EMAIL_DOMAIN, which is how cleanup finds leftovers of runs that
// died halfway.
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { createContainer } from "@time-craft/api/container";
import { seedHousehold } from "@time-craft/api/seed";
import type {
	JobScheduler,
	Notifier,
	ParentActor,
	ResetPasswordTarget,
} from "@time-craft/core";
import {
	activities,
	authRateLimit,
	authUser,
	bonusTasks,
	childRequests,
	children,
	families,
	parents,
	quotaOverrides,
	quotaPolicies,
	sessions,
	taskReports,
} from "@time-craft/db";
import { and, eq, inArray, like, notInArray, or } from "drizzle-orm";
import type { E2eDb } from "./db";

export const E2E_EMAIL_DOMAIN = "e2e.timecraft.test";

// The child's limits. Big enough that a run never uses them up by accident;
// the override tests use them up on purpose.
export const POLICY = {
	dailyLimitMinutes: 120,
	weeklyLimitMinutes: 600,
	weeklyBonusCapMinutes: 60,
	warningMinutes: 5,
};

export const AUTO_CLOSE_AFTER_MINUTES = 30;

export interface TestParent {
	id: string;
	authUserId: string;
	name: string;
	email: string;
	password: string;
}

export interface TestChild {
	id: string;
	authUserId: string;
	name: string;
	username: string;
	pin: string;
}

export interface TestBonusTask {
	id: string;
	name: string;
	rewardMinutes: number;
}

export interface TestFamily {
	id: string;
	name: string;
	timezone: string;
	parents: [TestParent, TestParent];
	// null for a family whose parents create the child from the app.
	child: TestChild | null;
	activities: { game: string; tv: string };
	policyId: string | null;
	bonusTasks: TestBonusTask[];
	recoveryCode: string;
}

const TASKS = [
	{
		name: "Ordenar el cuarto",
		description: "Cama tendida y juguetes en su caja",
		rewardMinutes: 15,
	},
	{ name: "Hacer los deberes", description: null, rewardMinutes: 20 },
];

// Whole-hour zones around the globe; the one closest to noon right now.
const ZONES = [
	"Pacific/Pago_Pago",
	"Pacific/Honolulu",
	"America/Anchorage",
	"America/Los_Angeles",
	"America/Denver",
	"America/Mexico_City",
	"America/Guayaquil",
	"America/Santo_Domingo",
	"America/Sao_Paulo",
	"Atlantic/South_Georgia",
	"Atlantic/Cape_Verde",
	"UTC",
	"Africa/Lagos",
	"Africa/Cairo",
	"Europe/Moscow",
	"Asia/Dubai",
	"Asia/Karachi",
	"Asia/Dhaka",
	"Asia/Bangkok",
	"Asia/Shanghai",
	"Asia/Tokyo",
	"Australia/Brisbane",
	"Pacific/Noumea",
	"Pacific/Auckland",
	"Pacific/Tongatapu",
	"Pacific/Kiritimati",
];

function minutesIntoDay(zone: string, now: Date): number {
	const parts = new Intl.DateTimeFormat("en", {
		timeZone: zone,
		hour: "numeric",
		minute: "numeric",
		hourCycle: "h23",
	}).formatToParts(now);
	const part = (type: string) =>
		Number(parts.find((p) => p.type === type)?.value ?? 0);
	return part("hour") * 60 + part("minute");
}

export function noonZone(now = new Date()): string {
	const distance = (zone: string) =>
		Math.abs(minutesIntoDay(zone, now) - 12 * 60);
	return ZONES.reduce((best, zone) =>
		distance(zone) < distance(best) ? zone : best,
	);
}

function secret(bytes: number): string {
	return randomBytes(bytes).toString("base64url");
}

function pin(): string {
	return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// Better Auth and core over the e2e's connection. The family never schedules
// jobs or sends pushes from here: only the api under test does.
export function createServices(db: E2eDb) {
	const unused = (what: string) => async () => {
		throw new Error(`The e2e fixtures do not ${what}`);
	};
	const jobs: JobScheduler = {
		schedule: unused("schedule jobs"),
		cancel: unused("cancel jobs"),
	};
	const notifier: Notifier = { send: unused("send pushes") };
	const { auth, core } = createContainer({
		db,
		// Only hashes passwords: nothing is signed with this secret.
		auth: { baseURL: "http://localhost", secret: secret(32), silent: true },
		clock: { now: () => new Date() },
		jobs,
		notifier,
		jobSignatures: { verify: async () => false },
	});
	return { db, auth, core };
}

export type Services = ReturnType<typeof createServices>;

export function parentActor(
	family: TestFamily,
	parent: TestParent = family.parents[0],
): ParentActor {
	return { kind: "parent", parentId: parent.id, familyId: family.id };
}

export async function createTestFamily(
	services: Services,
	options: { child?: boolean } = {},
): Promise<TestFamily> {
	const { db, core } = services;
	const tag = randomUUID().slice(0, 8);
	const people = [
		{
			name: "Ana",
			email: `ana.${tag}@${E2E_EMAIL_DOMAIN}`,
			password: secret(12),
		},
		{
			name: "Luis",
			email: `luis.${tag}@${E2E_EMAIL_DOMAIN}`,
			password: secret(12),
		},
	] as const;
	const child =
		options.child === false
			? undefined
			: { name: "Mateo", username: `e2e_${tag}`, pin: pin() };

	const seeded = await seedHousehold(services, {
		familyName: `E2E ${tag}`,
		parents: [
			{ name: people[0].name, email: people[0].email },
			{ name: people[1].name, email: people[1].email },
		],
		parentPasswords: [people[0].password, people[1].password],
		...(child === undefined ? {} : { child }),
		// The bonus cap and the warning are core's defaults (POLICY's).
		policy: {
			dailyLimitMinutes: POLICY.dailyLimitMinutes,
			weeklyLimitMinutes: POLICY.weeklyLimitMinutes,
		},
	});
	if (seeded.recoveryCode === null) {
		throw new Error("The seed did not create a recovery code");
	}
	const familyId = seeded.familyId;
	const timezone = noonZone();
	await db.update(families).set({ timezone }).where(eq(families.id, familyId));

	const parentRows = await db
		.select({
			id: parents.id,
			authUserId: parents.authUserId,
			email: authUser.email,
		})
		.from(parents)
		.innerJoin(authUser, eq(authUser.id, parents.authUserId))
		.where(eq(parents.familyId, familyId));
	const testParents = people.map((person) => {
		const row = parentRows.find((r) => r.email === person.email);
		if (row === undefined) {
			throw new Error(`Parent ${person.email} was not created`);
		}
		return { id: row.id, authUserId: row.authUserId, ...person };
	}) as [TestParent, TestParent];

	const activityRows = await db
		.select({ id: activities.id, code: activities.code })
		.from(activities)
		.where(eq(activities.familyId, familyId));
	const activityId = (code: string) => {
		const id = activityRows.find((a) => a.code === code)?.id;
		if (id === undefined) {
			throw new Error(`Activity ${code} was not created`);
		}
		return id;
	};

	const family: TestFamily = {
		id: familyId,
		name: `E2E ${tag}`,
		timezone,
		parents: testParents,
		child: null,
		activities: { game: activityId("game"), tv: activityId("tv") },
		policyId: null,
		bonusTasks: [],
		recoveryCode: seeded.recoveryCode,
	};
	const actor = parentActor(family);

	if (child !== undefined) {
		const [row] = await db
			.select({ id: children.id, authUserId: children.authUserId })
			.from(children)
			.where(eq(children.familyId, familyId));
		if (row === undefined) {
			throw new Error("The child was not created");
		}
		family.child = { ...row, ...child };
		const [policy] = await core.listCurrentPolicies(actor, { childId: row.id });
		family.policyId = policy?.id ?? null;
	}

	for (const task of TASKS) {
		const created = await core.createBonusTask(actor, task);
		family.bonusTasks.push({
			id: created.id,
			name: created.name,
			rewardMinutes: created.rewardMinutes,
		});
	}
	return family;
}

// Back to how createTestFamily left it, between tests: no sessions, requests,
// overrides or reports; the original policy and tasks; no lockout; and fresh
// sign-in limits (Better Auth's are per IP and path, and the e2e signs in
// more than five times a minute). Close an open session through the api
// first (closeOpenSession in tests/support), so its QStash messages are
// cancelled instead of firing at rows that no longer exist.
export async function resetTestFamily(
	db: E2eDb,
	family: TestFamily,
): Promise<void> {
	const child = family.child;
	await db.transaction(async (tx) => {
		if (child !== null) {
			// Pauses and alerts go with their session (ON DELETE CASCADE).
			await tx.delete(sessions).where(eq(sessions.childId, child.id));
			await tx
				.delete(quotaOverrides)
				.where(eq(quotaOverrides.childId, child.id));
			await tx.delete(childRequests).where(eq(childRequests.childId, child.id));
			await tx.delete(taskReports).where(eq(taskReports.childId, child.id));
			if (family.policyId !== null) {
				await tx
					.delete(quotaPolicies)
					.where(
						and(
							eq(quotaPolicies.childId, child.id),
							notInArray(quotaPolicies.id, [family.policyId]),
						),
					);
				await tx
					.update(quotaPolicies)
					.set({ validTo: null })
					.where(eq(quotaPolicies.id, family.policyId));
			}
			await tx
				.update(children)
				.set({ failedPinAttempts: 0, lockedUntil: null })
				.where(eq(children.id, child.id));
		}
		const taskIds = family.bonusTasks.map((task) => task.id);
		await tx
			.delete(bonusTasks)
			.where(
				and(
					eq(bonusTasks.familyId, family.id),
					taskIds.length > 0 ? notInArray(bonusTasks.id, taskIds) : undefined,
				),
			);
		await tx
			.update(bonusTasks)
			.set({ isActive: true })
			.where(eq(bonusTasks.familyId, family.id));
		await tx
			.update(families)
			.set({ autoCloseAfterMinutes: AUTO_CLOSE_AFTER_MINUTES })
			.where(eq(families.id, family.id));
	});
	await clearSignInLimits(db);
}

// Better Auth's keys are `<ip>|<path>`; the recovery code's, `api|recovery-code|<ip>`.
export async function clearSignInLimits(db: E2eDb): Promise<void> {
	await db
		.delete(authRateLimit)
		.where(
			or(
				like(authRateLimit.key, "%|/sign-in/%"),
				like(authRateLimit.key, "api|recovery-code|%"),
			),
		);
}

// Sets a parent's password or the child's PIN back to the one in `family`
// (a test changed it). A new PIN also lifts the child's lockout.
export async function restoreCredentials(
	services: Services,
	family: TestFamily,
): Promise<void> {
	const [first, second] = family.parents;
	const reset = (
		actor: TestParent,
		target: ResetPasswordTarget,
		newPassword: string,
	) =>
		services.core.resetPassword(parentActor(family, actor), {
			target,
			newPassword,
		});
	await reset(second, { kind: "parent", parentId: first.id }, first.password);
	await reset(first, { kind: "parent", parentId: second.id }, second.password);
	if (family.child !== null) {
		await reset(
			first,
			{ kind: "child", childId: family.child.id },
			family.child.pin,
		);
	}
}

// The ids of every family whose parents all use the e2e's email domain.
export async function findTestFamilies(db: E2eDb): Promise<string[]> {
	const rows = await db
		.select({ familyId: parents.familyId, email: authUser.email })
		.from(parents)
		.innerJoin(authUser, eq(authUser.id, parents.authUserId));
	const byFamily = new Map<string, boolean>();
	for (const row of rows) {
		const isTest = row.email.endsWith(`@${E2E_EMAIL_DOMAIN}`);
		byFamily.set(row.familyId, (byFamily.get(row.familyId) ?? true) && isTest);
	}
	return [...byFamily].filter(([, isTest]) => isTest).map(([id]) => id);
}

// Deletes test families and their logins. Refuses a family that has a parent
// outside the e2e's email domain, so a wrong id never deletes a real one.
export async function deleteTestFamilies(
	db: E2eDb,
	familyIds: readonly string[],
): Promise<number> {
	if (familyIds.length === 0) {
		return 0;
	}
	const testFamilies = new Set(await findTestFamilies(db));
	const foreign = familyIds.filter((id) => !testFamilies.has(id));
	if (foreign.length > 0) {
		throw new Error(
			`Not test families (or already gone), nothing deleted: ${foreign.join(", ")}`,
		);
	}
	const ids = [...familyIds];
	return db.transaction(async (tx) => {
		const childRows = await tx
			.select({ id: children.id, authUserId: children.authUserId })
			.from(children)
			.where(inArray(children.familyId, ids));
		const parentRows = await tx
			.select({ authUserId: parents.authUserId })
			.from(parents)
			.where(inArray(parents.familyId, ids));
		const childIds = childRows.map((row) => row.id);
		if (childIds.length > 0) {
			// Pauses and alerts go with their session (ON DELETE CASCADE).
			await tx.delete(sessions).where(inArray(sessions.childId, childIds));
			await tx
				.delete(quotaOverrides)
				.where(inArray(quotaOverrides.childId, childIds));
			await tx
				.delete(childRequests)
				.where(inArray(childRequests.childId, childIds));
			await tx
				.delete(taskReports)
				.where(inArray(taskReports.childId, childIds));
			await tx
				.delete(quotaPolicies)
				.where(inArray(quotaPolicies.childId, childIds));
		}
		await tx.delete(bonusTasks).where(inArray(bonusTasks.familyId, ids));
		await tx.delete(children).where(inArray(children.familyId, ids));
		await tx.delete(parents).where(inArray(parents.familyId, ids));
		await tx.delete(activities).where(inArray(activities.familyId, ids));
		await tx.delete(families).where(inArray(families.id, ids));
		// Their sessions, accounts and push subscriptions go with them.
		const authUserIds = [...childRows, ...parentRows].map((r) => r.authUserId);
		if (authUserIds.length > 0) {
			await tx.delete(authUser).where(inArray(authUser.id, authUserIds));
		}
		return ids.length;
	});
}
