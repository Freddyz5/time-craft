// Seeds the household: the family, both parents (auth_user + parents) and the
// game and TV activities. Parents get no password: they sign in with Google,
// and Phase 4 adds passwords, the child, its policy and the recovery code,
// which need Better Auth.
// Idempotent: it only creates what is missing and never changes existing rows.
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import type { Db, Transaction } from "./client";
import { activities, authUser, families, parents } from "./schema";

export interface SeedParent {
	name: string;
	email: string;
}

export interface SeedInput {
	familyName: string;
	parents: [SeedParent, SeedParent];
}

export interface SeedResult {
	familyId: string;
	created: { family: boolean; parents: number; activities: number };
}

const seedActivities = [
	{ code: "game", name: "Juego" },
	{ code: "tv", name: "TV" },
];

export async function seed(db: Db, input: SeedInput): Promise<SeedResult> {
	// Better Auth stores emails lowercased; match it so Google sign-in finds them.
	const people = input.parents.map((parent) => ({
		name: parent.name.trim(),
		email: parent.email.trim().toLowerCase(),
	}));
	const emails = people.map((person) => person.email);
	if (new Set(emails).size !== emails.length) {
		throw new Error("Each parent needs a different email");
	}

	return db.transaction(async (tx) => {
		await tx
			.insert(authUser)
			.values(people.map((person) => ({ id: randomUUID(), ...person })))
			.onConflictDoNothing({ target: authUser.email });
		const users = await tx
			.select({ id: authUser.id, email: authUser.email })
			.from(authUser)
			.where(inArray(authUser.email, emails));
		const parentRows = people.map((person) => {
			const user = users.find((user) => user.email === person.email);
			if (user === undefined) {
				throw new Error(`auth_user missing for ${person.email}`);
			}
			return { authUserId: user.id, name: person.name };
		});

		// The family is the one the parents already belong to, if any.
		const existing = await tx
			.selectDistinct({ familyId: parents.familyId })
			.from(parents)
			.where(
				inArray(
					parents.authUserId,
					parentRows.map((row) => row.authUserId),
				),
			);
		if (existing.length > 1) {
			throw new Error("The parents already belong to different families");
		}
		const familyId =
			existing[0]?.familyId ?? (await insertFamily(tx, input.familyName));

		const createdParents = await tx
			.insert(parents)
			.values(parentRows.map((row) => ({ familyId, ...row })))
			.onConflictDoNothing({ target: parents.authUserId })
			.returning({ id: parents.id });

		const createdActivities = await tx
			.insert(activities)
			.values(seedActivities.map((activity) => ({ familyId, ...activity })))
			.onConflictDoNothing({ target: [activities.familyId, activities.code] })
			.returning({ id: activities.id });

		return {
			familyId,
			created: {
				family: existing.length === 0,
				parents: createdParents.length,
				activities: createdActivities.length,
			},
		};
	});
}

async function insertFamily(tx: Transaction, name: string) {
	const [family] = await tx
		.insert(families)
		.values({ name: name.trim() })
		.returning({ id: families.id });
	if (family === undefined) {
		throw new Error("The family was not created");
	}
	return family.id;
}
