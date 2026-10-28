// Each person in their own browser context, as on their own phone: Ana and
// Luis (the parents) and the child. They sign in through the api once and
// reuse that session; if a test closed it, they sign in again.
import {
	type APIRequestContext,
	type Browser,
	type BrowserContext,
	type BrowserContextOptions,
	devices,
	type Page,
	type PlaywrightWorkerArgs,
} from "@playwright/test";
import type { E2eDb } from "../../src/db";
import { baseUrl, bypassHeaders } from "../../src/env";
import { clearSignInLimits, type TestFamily } from "../../src/family";
import { authFile, type Who } from "./state";

export interface Person {
	context: BrowserContext;
	page: Page;
	// Shares the page's cookies: the api as this person.
	request: APIRequestContext;
}

export type Credentials =
	| { kind: "parent"; email: string; password: string }
	| { kind: "child"; username: string; pin: string };

type Playwright = PlaywrightWorkerArgs["playwright"];

// What every context gets: a phone, the base URL and Vercel's bypass.
export function contextOptions(): BrowserContextOptions {
	return {
		...devices["Pixel 7"],
		baseURL: baseUrl(),
		extraHTTPHeaders: bypassHeaders(),
		locale: "es-EC",
	};
}

export function credentialsOf(family: TestFamily, who: Who): Credentials {
	if (who === "child") {
		if (family.child === null) {
			throw new Error("This family has no child");
		}
		return {
			kind: "child",
			username: family.child.username,
			pin: family.child.pin,
		};
	}
	const parent = family.parents[who === "ana" ? 0 : 1];
	return { kind: "parent", email: parent.email, password: parent.password };
}

// Better Auth checks the Origin of its POSTs, as the browser sends it.
export async function signIn(
	request: APIRequestContext,
	credentials: Credentials,
): Promise<void> {
	const headers = { origin: baseUrl() };
	const response =
		credentials.kind === "parent"
			? await request.post("/api/auth/sign-in/email", {
					headers,
					data: { email: credentials.email, password: credentials.password },
				})
			: await request.post("/api/auth/sign-in/username", {
					headers,
					data: { username: credentials.username, password: credentials.pin },
				});
	if (!response.ok()) {
		throw new Error(
			`Sign-in as ${credentials.kind} failed: ${response.status()} ${await response.text()}`,
		);
	}
}

// The api as `who`, signed in: the saved session if it still works.
export async function apiAs(
	playwright: Playwright,
	db: E2eDb,
	family: TestFamily,
	who: Who,
): Promise<APIRequestContext> {
	const file = authFile(who);
	const request = await playwright.request.newContext({
		baseURL: baseUrl(),
		extraHTTPHeaders: bypassHeaders(),
		storageState: file,
	});
	if ((await request.get("/api/me")).status() === 401) {
		await clearSignInLimits(db);
		await signIn(request, credentialsOf(family, who));
		await request.storageState({ path: file });
	}
	return request;
}

export async function openAs(
	browser: Browser,
	playwright: Playwright,
	db: E2eDb,
	family: TestFamily,
	who: Who,
): Promise<Person> {
	await (await apiAs(playwright, db, family, who)).dispose();
	const context = await browser.newContext({
		...contextOptions(),
		storageState: authFile(who),
	});
	const page = await context.newPage();
	return { context, page, request: context.request };
}
