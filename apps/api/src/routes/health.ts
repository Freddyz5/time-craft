// Health, without a session: the api's version, its environment and the web
// it serves (BETTER_AUTH_URL's origin). /health is for the api's own domain;
// /api/health answers through the web's rewrite, so a web can tell whether
// its /api reaches the api of its own environment, and not production's.
import { Hono } from "hono";
// The release writes the api's version here (scripts/release).
import pkg from "../../package.json" with { type: "json" };
import type { AppDeps, AppEnv } from "../http/context";

export function healthRoutes({ deployment }: AppDeps) {
	const health = () => ({
		ok: true as const,
		app: { name: "Time Craft", version: pkg.version },
		environment: deployment.environment,
		web: deployment.web,
	});
	return new Hono<AppEnv>()
		.get("/health", (c) => c.json(health(), 200))
		.get("/api/health", (c) => c.json(health(), 200));
}
