// Vercel's Ignored Build Step for one app: the `ignoreCommand` of its Vercel
// config. Vercel builds when this exits with 1 and cancels the deployment
// when it exits with 0.
//
//   node ../../scripts/vercel-ignore.mjs <package> [--type-only <dependency>]...
//
// Turborepo decides, with `turbo query` (the successor of turbo-ignore): the
// app builds when it, or a workspace package it depends on, changed since
// the branch's last successful deployment (VERCEL_GIT_PREVIOUS_SHA). A
// --type-only dependency does not count: the web imports only the api's
// types, so a change that reaches the web only through the api leaves the
// web's build output as it was.
//
// When in doubt it builds: on a branch's first deployment, when that commit
// is missing from Vercel's shallow clone (turbo then reports every package),
// or when turbo fails. Runs before the install, with plain Node.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BUILD = 1;
const SKIP = 0;
const root = new URL("..", import.meta.url);

function parseArgs(args) {
	const [target, ...rest] = args;
	const typeOnly = [];
	for (let i = 0; i < rest.length; i += 2) {
		if (rest[i] !== "--type-only" || rest[i + 1] === undefined) {
			throw new Error(`Unexpected argument: ${rest[i]}`);
		}
		typeOnly.push(rest[i + 1]);
	}
	if (target === undefined) {
		throw new Error(
			"Usage: vercel-ignore.mjs <package> [--type-only <dep>]...",
		);
	}
	return { target, typeOnly };
}

// Affected packages since `base`, and the target's workspace dependencies.
function queryTurbo(base, target) {
	const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
	const query = `query {
		affectedPackages(base: "${base}", head: "HEAD") {
			items { name reason { __typename } }
		}
		package(name: "${target}") {
			directDependencies { items { name allDependencies { items { name } } } }
		}
	}`;
	const output = execFileSync(
		"npx",
		["--yes", `turbo@${pkg.devDependencies.turbo}`, "query", query],
		{
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "inherit"],
			env: {
				...process.env,
				TURBO_TELEMETRY_DISABLED: "1",
				TURBO_NO_UPDATE_NOTIFIER: "1",
			},
		},
	);
	return JSON.parse(output).data;
}

function decide({ target, typeOnly }) {
	const base = process.env.VERCEL_GIT_PREVIOUS_SHA ?? "";
	if (!/^[0-9a-f]{7,40}$/.test(base)) {
		return [BUILD, "first deployment of this branch"];
	}
	const data = queryTurbo(base, target);
	const affected = new Map(
		data.affectedPackages.items.map((item) => [
			item.name,
			item.reason.__typename,
		]),
	);
	const reason = affected.get(target);
	if (reason === undefined) {
		return [SKIP, `nothing ${target} depends on changed`];
	}
	// Turbo reports a package's own change (files, lockfile, global files)
	// before one that comes from a dependency.
	if (reason !== "DependencyChanged") {
		return [BUILD, `${target} changed (${reason})`];
	}
	const counted = new Set();
	for (const dependency of data.package.directDependencies.items) {
		if (typeOnly.includes(dependency.name)) {
			continue;
		}
		counted.add(dependency.name);
		for (const indirect of dependency.allDependencies.items) {
			counted.add(indirect.name);
		}
	}
	// The repo root: every change touches it, and turbo already reports the
	// root files that matter (turbo.json, globalDependencies) as global.
	counted.delete("//");
	const changed = [...counted].filter((name) => affected.has(name));
	if (changed.length > 0) {
		return [BUILD, `${changed.join(", ")} changed`];
	}
	return [
		SKIP,
		`the change reaches ${target} only through ${typeOnly.join(", ")}, whose types it uses`,
	];
}

let code = BUILD;
try {
	const [decision, why] = decide(parseArgs(process.argv.slice(2)));
	code = decision;
	console.log(`${decision === BUILD ? "Build" : "Skip"}: ${why}.`);
} catch (error) {
	console.log(`Build: the check failed (${error.message}).`);
}
process.exit(code);
