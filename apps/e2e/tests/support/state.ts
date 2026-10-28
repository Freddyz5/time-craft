// What the setup project leaves for the tests, under apps/e2e/.e2e
// (gitignored): the run's family, with its passwords, and each person's
// signed-in browser state.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestFamily } from "../../src/family";

const stateDir = fileURLToPath(new URL("../../.e2e/", import.meta.url));
const familyFile = `${stateDir}family.json`;

export type Who = "ana" | "luis" | "child";

export function authFile(who: Who): string {
	return `${stateDir}auth/${who}.json`;
}

export function writeFamily(family: TestFamily): void {
	mkdirSync(dirname(authFile("ana")), { recursive: true });
	writeFileSync(familyFile, JSON.stringify(family, null, 2));
}

export function readFamily(): TestFamily {
	return JSON.parse(readFileSync(familyFile, "utf8")) as TestFamily;
}

export function hasFamily(): boolean {
	try {
		readFamily();
		return true;
	} catch {
		return false;
	}
}

export function clearState(): void {
	rmSync(familyFile, { force: true });
	rmSync(dirname(authFile("ana")), { recursive: true, force: true });
}
