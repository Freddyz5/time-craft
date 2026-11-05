import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField } from "astro/config";

// The repo root holds the one .env for local development. On Vercel the
// variables come from the project settings (process.env) instead.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// In development the api runs apart (bun run dev); the proxy keeps /api on
// the web's origin, as Vercel's rewrite does in production: same-origin
// cookies and no CORS. BETTER_AUTH_URL must then be this origin.
const apiTarget = process.env.API_DEV_URL ?? "http://localhost:3000";

// Which deployment this build is for, from Vercel's system variables (missing
// outside Vercel): every page that is not production's says so. Same rule as
// the api's (apps/api/src/environment.ts).
function environment(): "production" | "dev" | "preview" | "local" {
	if (process.env.VERCEL_ENV === "production") {
		return "production";
	}
	if (process.env.VERCEL_ENV === "preview") {
		return process.env.VERCEL_GIT_COMMIT_REF === "dev" ? "dev" : "preview";
	}
	return "local";
}

export default defineConfig({
	output: "static",
	integrations: [react()],
	devToolbar: { enabled: false },
	env: {
		schema: {
			// Public by design: the browser needs it to subscribe to push.
			VAPID_PUBLIC_KEY: envField.string({
				context: "client",
				access: "public",
				optional: true,
			}),
			// Google sign-in is offered only where the api has it (dev and
			// production). The client id is public: it travels in Google's URL.
			GOOGLE_CLIENT_ID: envField.string({
				context: "client",
				access: "public",
				optional: true,
			}),
			// Worked out at build time; not a variable to set.
			TIMECRAFT_ENV: envField.enum({
				context: "client",
				access: "public",
				values: ["production", "dev", "preview", "local"],
				default: environment(),
			}),
		},
	},
	vite: {
		envDir: repoRoot,
		plugins: [tailwindcss()],
		server: {
			proxy: {
				"/api": { target: apiTarget, changeOrigin: false },
			},
		},
	},
});
