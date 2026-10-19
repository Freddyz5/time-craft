// Bundles the Vercel entrypoint into dist/index.js. Workspace packages export
// TypeScript source, so they are inlined; npm dependencies stay external and
// Vercel traces them from node_modules. `hono` must stay external: Vercel
// detects the entrypoint by looking for a `hono` import.
import { rm } from "node:fs/promises";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };

const root = join(import.meta.dirname, "..");
const outdir = join(root, "dist");
const external = Object.keys(pkg.dependencies).filter(
	(name) => !name.startsWith("@time-craft/"),
);

await rm(outdir, { recursive: true, force: true });
await Bun.build({
	entrypoints: [join(root, "src/index.ts")],
	outdir,
	target: "node",
	format: "esm",
	sourcemap: "linked",
	external,
});
