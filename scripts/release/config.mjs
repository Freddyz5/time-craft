// semantic-release's config for one app, picked by RELEASE_APP (web, api or
// mobile):
//
//   RELEASE_APP=web bun run release
//
// .github/workflows/release.yml runs it for each app on every push to prod.
// Each app has its own version: its package.json holds it, its tags read
// web-v1.2.0, api-v1.2.0 or mobile-v1.2.0, and it gets its own CHANGELOG.md
// and GitHub release. A mobile-v tag builds the signed APK and attaches it
// to that release (.github/workflows/android.yml). The version counts only the commits that touched the app, a
// workspace package it depends on or a root file every build reads, so a
// feat(core) releases the api. As in scripts/vercel-ignore.mjs, the web
// leaves out the api: it uses only its types.
//
// Production deploys only release commits (scripts/vercel-ignore.mjs), so
// every change that ships must release: refactor, build, style, chore and ci
// are a patch too. Only docs and test leave the app as it is.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

const apps = {
	web: { name: "@time-craft/web", typeOnly: ["@time-craft/api"] },
	api: { name: "@time-craft/api", typeOnly: [] },
	// The app shows the deployed web: a web release reaches it without a new
	// APK, so only apps/mobile's own changes release it.
	mobile: { name: "@time-craft/mobile", typeOnly: [] },
};

// What turbo also counts for every package: its global dependencies, its own
// config and the lockfile.
const rootFiles = ["package.json", "bunfig.toml", "turbo.json", "bun.lock"];

// Custom rules replace the defaults for a commit they match, so breaking
// changes are repeated here. feat, fix, perf and revert keep the defaults.
const releaseRules = [
	{ breaking: true, release: "major" },
	...["refactor", "build", "style", "chore", "ci"].map((type) => ({
		type,
		release: "patch",
	})),
];

// The sections of the notes. The patch-only types share one.
const noteTypes = [
	{ type: "feat", section: "Features" },
	{ type: "fix", section: "Bug Fixes" },
	{ type: "perf", section: "Performance" },
	{ type: "revert", section: "Reverts" },
	...["refactor", "build", "style", "chore", "ci"].map((type) => ({
		type,
		section: "Other changes",
	})),
	{ type: "docs", hidden: true },
	{ type: "test", hidden: true },
];

function readJson(file) {
	return JSON.parse(readFileSync(file, "utf8"));
}

// Workspace packages by name, with their folder relative to the repo root.
function workspacePackages() {
	const packages = new Map();
	for (const pattern of readJson(join(root, "package.json")).workspaces) {
		const parent = pattern.replace(/\/\*$/, "");
		for (const entry of readdirSync(join(root, parent))) {
			const folder = `${parent}/${entry}`;
			const file = join(root, folder, "package.json");
			if (existsSync(file)) {
				const pkg = readJson(file);
				packages.set(pkg.name, { folder, pkg });
			}
		}
	}
	return packages;
}

// The app's folder first, then those of the workspace packages it depends
// on, directly or not, except the type-only ones.
function foldersOf({ name, typeOnly }) {
	const packages = workspacePackages();
	const folders = [];
	const seen = new Set();
	const pending = [name];
	while (pending.length > 0) {
		const current = pending.shift();
		if (seen.has(current) || typeOnly.includes(current)) {
			continue;
		}
		seen.add(current);
		const { folder, pkg } = packages.get(current);
		folders.push(folder);
		const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
		for (const [dependency, range] of Object.entries(dependencies)) {
			if (range.startsWith("workspace:")) {
				pending.push(dependency);
			}
		}
	}
	return folders;
}

// biome-ignore lint/suspicious/noUndeclaredEnvVars: semantic-release runs outside turbo.
const key = process.env.RELEASE_APP;
const app = apps[key];
if (app === undefined) {
	throw new Error(
		`RELEASE_APP must be one of ${Object.keys(apps).join(", ")}, not "${key}".`,
	);
}
const folders = foldersOf(app);
const [folder] = folders;

export default {
	branches: ["prod"],
	tagFormat: `${key}-v\${version}`,
	plugins: [
		[
			fileURLToPath(new URL("plugin.mjs", import.meta.url)),
			{
				preset: "conventionalcommits",
				presetConfig: { types: noteTypes },
				releaseRules,
				folder,
				paths: [...folders, ...rootFiles],
			},
		],
		[
			"@semantic-release/changelog",
			{
				changelogFile: `${folder}/CHANGELOG.md`,
				changelogTitle: "# Changelog",
			},
		],
		[
			"@semantic-release/git",
			{
				assets: [`${folder}/package.json`, `${folder}/CHANGELOG.md`],
				// Production builds only this commit, recognized by this message
				// (scripts/vercel-ignore.mjs). No [skip ci]: Migrate must run on
				// it, or Vercel's Deployment Checks hold the api's deployment.
				message: `chore(release): ${key}-v\${nextRelease.version}`,
			},
		],
		[
			"@semantic-release/github",
			{ successCommentCondition: false, failCommentCondition: false },
		],
	],
};
