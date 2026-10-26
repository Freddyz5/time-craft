// Vercel configuration of the web project (Root Directory: apps/web). Vercel
// runs this file at build time, with the project's environment variables.
// The build settings live here, not in the dashboard. See docs/deploy.md.

import { routes } from "@vercel/config/v1";

// The browser calls /api/* on the web's own domain and Vercel proxies it to
// the api: cookies stay first-party and there is no CORS. The api differs per
// environment, so its origin comes from API_ORIGIN: the api's production
// domain in Production, its fixed dev domain in Preview.
const apiOrigin = process.env.API_ORIGIN?.trim() ?? "";
if (!/^https:\/\/[a-z0-9.-]+$/.test(apiOrigin)) {
	throw new Error(
		"API_ORIGIN must be the api's origin, like https://time-craft-api.vercel.app (see docs/deploy.md)",
	);
}

export const config = {
	framework: "astro",
	// Run from apps/web, Bun installs the whole workspace at the repo root.
	installCommand: "bun install --frozen-lockfile",
	buildCommand: "cd ../.. && bun run build --filter=@time-craft/web",
	outputDirectory: "dist",
	// Builds only when the web changed: the api counts only through its types.
	ignoreCommand:
		"node ../../scripts/vercel-ignore.mjs @time-craft/web --type-only @time-craft/api",
	// Through the helper: Vercel's deployment rejected the same rule written as
	// a plain object with a computed destination (`rewrites[0]` missing
	// `destination`), before the build even started.
	rewrites: [routes.rewrite("/api/:path*", `${apiOrigin}/api/:path*`)],
};
