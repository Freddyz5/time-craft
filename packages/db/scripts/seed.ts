// bun run db:seed: seeds the database at DATABASE_URL_UNPOOLED from the SEED_*
// variables (the package script loads the repo root .env). Safe to rerun.
import { createDb } from "../src/client";
import { seed } from "../src/seed";

const names = [
	"DATABASE_URL_UNPOOLED",
	"SEED_FAMILY_NAME",
	"SEED_PARENT_1_NAME",
	"SEED_PARENT_1_EMAIL",
	"SEED_PARENT_2_NAME",
	"SEED_PARENT_2_EMAIL",
] as const;

const env = Object.fromEntries(
	names.map((name) => [name, process.env[name]?.trim() ?? ""]),
) as Record<(typeof names)[number], string>;
const missing = names.filter((name) => env[name] === "");
if (missing.length > 0) {
	console.error(`Missing environment variables: ${missing.join(", ")}`);
	process.exit(1);
}

const db = createDb(env.DATABASE_URL_UNPOOLED);
try {
	const { familyId, created } = await seed(db, {
		familyName: env.SEED_FAMILY_NAME,
		parents: [
			{ name: env.SEED_PARENT_1_NAME, email: env.SEED_PARENT_1_EMAIL },
			{ name: env.SEED_PARENT_2_NAME, email: env.SEED_PARENT_2_EMAIL },
		],
	});
	console.log(
		`Family ${familyId} (${created.family ? "created" : "already existed"}). ` +
			`Created ${created.parents} parent(s) and ${created.activities} activity(ies).`,
	);
} finally {
	await db.$client.end();
}
