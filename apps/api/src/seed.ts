// Seeds the household (bun run db:seed, see scripts/seed.ts): the family,
// both parents and the activities (packages/db), then what needs Better Auth
// and core:
// - a password for each parent who gets one and has none yet (optional:
//   parents can use Google only),
// - the child's login (username + PIN) and its child row,
// - a global quota policy for the child, if it has none,
// - the family's recovery code, if it has none. It is returned so the script
//   shows it once; only its hash is stored.
// Idempotent: it only creates what is missing and never changes existing rows.
import {
	type Core,
	type ParentActor,
	validateParentPassword,
} from "@time-craft/core";
import { authUser, children, type Db, families, parents } from "@time-craft/db";
import { type SeedInput, seed } from "@time-craft/db/seed";
import { asc, eq } from "drizzle-orm";
import { BetterAuthIdentityService } from "./adapters/identity";
import type { Auth } from "./auth";

export interface HouseholdSeedInput extends SeedInput {
	// Same order as `parents`; undefined: no password for that parent.
	parentPasswords?: [string | undefined, string | undefined];
	// Omitted: the parents create the child's account from the app.
	child?: { name: string; username: string; pin: string };
	policy: { dailyLimitMinutes: number; weeklyLimitMinutes: number };
}

export interface HouseholdSeedResult {
	familyId: string;
	created: {
		family: boolean;
		parents: number;
		activities: number;
		parentPasswords: number;
		child: boolean;
		policy: boolean;
	};
	// Only when it was generated now.
	recoveryCode: string | null;
}

export interface SeedServices {
	db: Db;
	auth: Auth;
	core: Core;
}

async function parentsOf(db: Db, familyId: string) {
	return db
		.select({ id: parents.id, authUserId: parents.authUserId })
		.from(parents)
		.where(eq(parents.familyId, familyId))
		.orderBy(asc(parents.createdAt));
}

async function hasPassword(auth: Auth, authUserId: string): Promise<boolean> {
	const ctx = await auth.$context;
	return (await ctx.internalAdapter.findCredentialAccount(authUserId)) !== null;
}

// The child row whose login has this username, if any.
async function childByUsername(db: Db, username: string) {
	const [row] = await db
		.select({ id: children.id, familyId: children.familyId })
		.from(children)
		.innerJoin(authUser, eq(authUser.id, children.authUserId))
		.where(eq(authUser.username, username.trim().toLowerCase()));
	return row ?? null;
}

export async function seedHousehold(
	{ db, auth, core }: SeedServices,
	input: HouseholdSeedInput,
): Promise<HouseholdSeedResult> {
	// Fail before writing anything.
	const passwords = (input.parentPasswords ?? [undefined, undefined]).map(
		(password) =>
			password === undefined ? undefined : validateParentPassword(password),
	);

	const base = await seed(db, input);
	const familyId = base.familyId;
	const familyParents = await parentsOf(db, familyId);
	const [first] = familyParents;
	if (first === undefined) {
		throw new Error("The family has no parents");
	}
	const actor: ParentActor = { kind: "parent", parentId: first.id, familyId };

	const identity = new BetterAuthIdentityService(auth);
	let parentPasswords = 0;
	for (const [index, person] of input.parents.entries()) {
		const password = passwords[index];
		const authUserId = await identity.findUserIdByEmail(
			person.email.trim().toLowerCase(),
		);
		if (
			password === undefined ||
			authUserId === null ||
			(await hasPassword(auth, authUserId))
		) {
			continue;
		}
		await identity.setPassword(authUserId, password);
		parentPasswords += 1;
	}

	let childId: string | null = null;
	let childCreated = false;
	if (input.child !== undefined) {
		const existing = await childByUsername(db, input.child.username);
		if (existing !== null && existing.familyId !== familyId) {
			throw new Error(
				`The username ${input.child.username} belongs to another family`,
			);
		}
		if (existing === null) {
			childId = (await core.createChildAccount(actor, input.child)).id;
			childCreated = true;
		} else {
			childId = existing.id;
		}
	}

	let policyCreated = false;
	if (childId !== null) {
		const current = await core.listCurrentPolicies(actor, { childId });
		if (current.length === 0) {
			await core.setPolicy(actor, { childId, ...input.policy });
			policyCreated = true;
		}
	}

	const [family] = await db
		.select({ recoveryCodeHash: families.recoveryCodeHash })
		.from(families)
		.where(eq(families.id, familyId));
	const recoveryCode =
		family?.recoveryCodeHash === null
			? (await core.regenerateRecoveryCode(actor)).recoveryCode
			: null;

	return {
		familyId,
		created: {
			...base.created,
			parentPasswords,
			child: childCreated,
			policy: policyCreated,
		},
		recoveryCode,
	};
}
