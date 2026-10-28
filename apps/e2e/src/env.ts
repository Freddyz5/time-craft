// Where the e2e runs. Each value comes from the shell or, for what the shell
// leaves out, the repo root .env (playwright.config.ts and the scripts load
// it). Error messages name the variables, never their values.

function value(name: string): string | undefined {
	const raw = process.env[name]?.trim();
	return raw === undefined || raw === "" ? undefined : raw;
}

function origin(name: string, fallback: string): string {
	return (value(name) ?? fallback).replace(/\/+$/, "");
}

// The web: localhost (bun run dev), the fixed dev domain or a PR preview.
// Everything else goes through its /api rewrite, as a browser's would.
export function baseUrl(): string {
	return origin("E2E_BASE_URL", "http://localhost:4321");
}

// The api's own origin, only for the smoke test's /health.
export function apiUrl(): string {
	return origin("E2E_API_URL", "http://localhost:3000");
}

// The direct (unpooled) connection string of the environment's database:
// the e2e creates its family there and checks rows the UI does not show.
export function databaseUrl(): string {
	const url = value("DATABASE_URL_UNPOOLED");
	if (url === undefined) {
		throw new Error(
			"DATABASE_URL_UNPOOLED is missing: the e2e needs the database of the environment it tests (see apps/e2e/CLAUDE.md)",
		);
	}
	return url;
}

// Vercel's Protection Bypass for Automation: the dev domain and the PR
// previews of the web sit behind Vercel Authentication. Every request sends
// the secret.
export function bypassHeaders(): Record<string, string> {
	const secret = value("VERCEL_AUTOMATION_BYPASS_SECRET");
	return secret === undefined ? {} : { "x-vercel-protection-bypass": secret };
}

// Asks Vercel for its bypass cookie too, for requests that cannot carry the
// header (the service worker's). Vercel sets it with a redirect, so only on
// a GET: a redirected sign-in POST would be lost.
export function bypassCookieHeaders(): Record<string, string> {
	return value("VERCEL_AUTOMATION_BYPASS_SECRET") === undefined
		? {}
		: { "x-vercel-set-bypass-cookie": "true" };
}

// The slow tests wait for QStash in real time (minutes).
export function runSlowTests(): boolean {
	return value("E2E_SLOW") === "1";
}
