// bun run db:seed: seeds the database at DATABASE_URL_UNPOOLED from the SEED_*
// variables (the package script loads the repo root .env). Safe to rerun: it
// only creates what is missing. The recovery code is printed once, when it is
// created; only its hash is stored.
import type { JobScheduler, Notifier } from "@time-craft/core";
import { createDb } from "@time-craft/db";
import * as z from "zod";
import { systemClock } from "../src/adapters/system";
import { createContainer } from "../src/container";
import { seedHousehold } from "../src/seed";

const blankAsMissing = (value: unknown) =>
	typeof value === "string" && value.trim() === "" ? undefined : value;
const required = z.preprocess(blankAsMissing, z.string().trim());
const optional = z.preprocess(blankAsMissing, z.string().optional());
const minutes = (fallback: number) =>
	z.preprocess(
		blankAsMissing,
		z.coerce.number().int().positive().default(fallback),
	);

const schema = z.object({
	DATABASE_URL_UNPOOLED: required,
	BETTER_AUTH_SECRET: required,
	BETTER_AUTH_URL: required,
	SEED_FAMILY_NAME: required,
	SEED_PARENT_1_NAME: required,
	SEED_PARENT_1_EMAIL: required,
	SEED_PARENT_1_PASSWORD: optional,
	SEED_PARENT_2_NAME: required,
	SEED_PARENT_2_EMAIL: required,
	SEED_PARENT_2_PASSWORD: optional,
	SEED_CHILD_NAME: optional,
	SEED_CHILD_USERNAME: optional,
	SEED_CHILD_PIN: optional,
	SEED_DAILY_LIMIT_MINUTES: minutes(60),
	SEED_WEEKLY_LIMIT_MINUTES: minutes(300),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
	const names = parsed.error.issues.map((issue) => issue.path.join("."));
	console.error(
		`Missing or invalid environment variables: ${names.join(", ")}`,
	);
	process.exit(1);
}
const env = parsed.data;

const childFields = [
	env.SEED_CHILD_NAME,
	env.SEED_CHILD_USERNAME,
	env.SEED_CHILD_PIN,
];
if (
	childFields.some((value) => value !== undefined) &&
	childFields.includes(undefined)
) {
	console.error(
		"Set SEED_CHILD_NAME, SEED_CHILD_USERNAME and SEED_CHILD_PIN together",
	);
	process.exit(1);
}

// The seed neither schedules jobs nor sends pushes.
const unused = (what: string) => async () => {
	throw new Error(`The seed does not ${what}`);
};
const jobs: JobScheduler = {
	schedule: unused("schedule jobs"),
	cancel: unused("cancel jobs"),
};
const notifier: Notifier = { send: unused("send pushes") };

const db = createDb(env.DATABASE_URL_UNPOOLED);
const { auth, core } = createContainer({
	db,
	auth: { baseURL: env.BETTER_AUTH_URL, secret: env.BETTER_AUTH_SECRET },
	clock: systemClock,
	jobs,
	notifier,
	jobSignatures: { verify: async () => false },
});

try {
	const { familyId, created, recoveryCode } = await seedHousehold(
		{ db, auth, core },
		{
			familyName: env.SEED_FAMILY_NAME,
			parents: [
				{ name: env.SEED_PARENT_1_NAME, email: env.SEED_PARENT_1_EMAIL },
				{ name: env.SEED_PARENT_2_NAME, email: env.SEED_PARENT_2_EMAIL },
			],
			parentPasswords: [env.SEED_PARENT_1_PASSWORD, env.SEED_PARENT_2_PASSWORD],
			...(env.SEED_CHILD_NAME !== undefined &&
			env.SEED_CHILD_USERNAME !== undefined &&
			env.SEED_CHILD_PIN !== undefined
				? {
						child: {
							name: env.SEED_CHILD_NAME,
							username: env.SEED_CHILD_USERNAME,
							pin: env.SEED_CHILD_PIN,
						},
					}
				: {}),
			policy: {
				dailyLimitMinutes: env.SEED_DAILY_LIMIT_MINUTES,
				weeklyLimitMinutes: env.SEED_WEEKLY_LIMIT_MINUTES,
			},
		},
	);
	console.log(
		[
			`Family ${familyId} (${created.family ? "created" : "already existed"}).`,
			`Created ${created.parents} parent(s), ${created.activities} activity(ies) and ${created.parentPasswords} parent password(s).`,
			`Child: ${created.child ? "created" : "unchanged"}. Policy: ${created.policy ? "created" : "unchanged"}.`,
		].join("\n"),
	);
	if (recoveryCode !== null) {
		console.log(
			[
				"",
				"Family recovery code (shown only now; keep it somewhere safe):",
				"",
				`    ${recoveryCode}`,
				"",
			].join("\n"),
		);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	await db.$client.end();
}
