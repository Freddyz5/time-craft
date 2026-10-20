// Vercel configuration of the web project (Root Directory: apps/web). Vercel
// runs this file at build time, with the project's environment variables.
// The build settings live here, not in the dashboard. See docs/deploy.md.

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
	rewrites: [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }],
};
