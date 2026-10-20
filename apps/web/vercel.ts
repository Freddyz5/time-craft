// Vercel configuration of the web project (Root Directory: apps/web). Vercel
// runs this file at build time, with the project's environment variables.
// The build settings live here, not in the dashboard. See docs/deploy.md.
export const config = {
	framework: "astro",
	// Run from apps/web, Bun installs the whole workspace at the repo root.
	installCommand: "bun install --frozen-lockfile",
	buildCommand: "cd ../.. && bun run build --filter=@time-craft/web",
	outputDirectory: "dist",
};
