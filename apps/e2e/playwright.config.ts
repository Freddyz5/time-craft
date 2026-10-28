// Two suites against E2E_BASE_URL (local, the dev domain or a PR preview):
// - e2e: the eight steps of the v1 flow, on a family the setup project
//   creates for the run and the teardown project deletes. Tests share that
//   family, so they run one at a time and each starts from a reset.
// - smoke: production, read only (no family, no database).
// Chrome is the installed one (channel "chrome"): Web Push needs it, and
// GitHub's Ubuntu runners have it, so nothing is downloaded.
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { baseUrl, bypassHeaders, runSlowTests } from "./src/env";

// The shell's variables win over the repo root .env.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) {
	process.loadEnvFile(rootEnv);
}

const ci = process.env.CI !== undefined;

export default defineConfig({
	testDir: "tests",
	outputDir: ".e2e/results",
	reporter: ci
		? [["list"], ["html", { open: "never", outputFolder: ".e2e/report" }]]
		: [["list"]],
	timeout: 60_000,
	// The other person's screen catches up by polling every 5 s.
	expect: { timeout: 15_000 },
	workers: 1,
	fullyParallel: false,
	retries: ci ? 1 : 0,
	use: {
		...devices["Pixel 7"],
		channel: "chrome",
		baseURL: baseUrl(),
		extraHTTPHeaders: bypassHeaders(),
		locale: "es-EC",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{ name: "setup", testMatch: "setup/family.setup.ts", teardown: "teardown" },
		{ name: "teardown", testMatch: "setup/family.teardown.ts" },
		{
			name: "e2e",
			testMatch: "flows/*.spec.ts",
			dependencies: ["setup"],
			// @slow waits minutes for QStash: E2E_SLOW=1 runs it too.
			grepInvert: runSlowTests() ? undefined : /@slow/,
		},
		{ name: "smoke", testMatch: "smoke/*.spec.ts" },
	],
});
