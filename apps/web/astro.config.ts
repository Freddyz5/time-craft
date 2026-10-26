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
