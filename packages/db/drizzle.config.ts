import { defineConfig } from "drizzle-kit";

// Direct (unpooled) connection string, for migrations and Studio. The package
// scripts load it from the repo root .env (bun --env-file); `generate` works
// offline, so a missing URL only fails the commands that connect.
const url = process.env.DATABASE_URL_UNPOOLED;

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema/index.ts",
	out: "./migrations",
	...(url ? { dbCredentials: { url } } : {}),
});
