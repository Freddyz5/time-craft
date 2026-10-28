// A semantic-release plugin for one app of the monorepo (see config.mjs).
// It runs the commit analyzer and the release notes only on the commits that
// touched the app's paths, and writes the new version into the app's
// package.json, where the web and the api read it.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as commitAnalyzer from "@semantic-release/commit-analyzer";
import * as releaseNotes from "@semantic-release/release-notes-generator";

// The context with only the commits since the last release that changed a
// file under the paths. Merge commits are left out: the commits they bring
// in count on their own. So are earlier release commits, which only ever
// change a version and a changelog.
function withOwnCommits(paths, context) {
	const { cwd, commits, lastRelease, logger } = context;
	const range = lastRelease.gitHead ? `${lastRelease.gitHead}..HEAD` : "HEAD";
	const args = ["log", "--format=%H", "--no-merges", "--full-history", range];
	const output = execFileSync("git", [...args, "--", ...paths], {
		cwd,
		encoding: "utf8",
	});
	const touched = new Set(output.split("\n"));
	const own = commits.filter(
		(commit) =>
			touched.has(commit.hash) && !commit.subject.startsWith("chore(release):"),
	);
	logger.log(
		`${own.length} of ${commits.length} commits touch ${paths.join(", ")}.`,
	);
	return { ...context, commits: own };
}

export function analyzeCommits({ folder, paths, ...config }, context) {
	return commitAnalyzer.analyzeCommits(config, withOwnCommits(paths, context));
}

export function generateNotes({ folder, paths, ...config }, context) {
	return releaseNotes.generateNotes(config, withOwnCommits(paths, context));
}

// Only the version's value changes: the file keeps its formatting.
export function prepare({ folder }, { cwd, nextRelease, logger }) {
	const file = join(cwd, folder, "package.json");
	const updated = readFileSync(file, "utf8").replace(
		/("version":\s*")[^"]*"/,
		`$1${nextRelease.version}"`,
	);
	if (JSON.parse(updated).version !== nextRelease.version) {
		throw new Error(`Could not write the version into ${folder}/package.json.`);
	}
	writeFileSync(file, updated);
	logger.log(`Wrote ${nextRelease.version} into ${folder}/package.json.`);
}
