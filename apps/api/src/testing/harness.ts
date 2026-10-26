// The api as tests use it: real routes, Better Auth, Drizzle repositories and
// migrations on PGlite (in memory), with fakes for QStash and Web Push and a
// fixed clock for core. Requests go through app.request(), cookies included.
// The seeded database is built once and each test gets a clone of it.
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
	FakeJobScheduler,
	FakeNotifier,
	FixedClock,
} from "@time-craft/core/testing";
import * as schema from "@time-craft/db";
import {
	activities,
	authUser,
	children,
	type Db,
	parents,
} from "@time-craft/db";
import { createTestDb } from "@time-craft/db/testing";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { jobsUrl, QStashSignatureVerifier } from "../adapters/qstash";
import { createContainer } from "../container";
import { seedHousehold } from "../seed";

// Wednesday 21 Oct 2026, 15:00 in Guayaquil (UTC−5).
export const NOW = "2026-10-21T15:00:00-05:00";

export const PUBLIC_API_URL = "https://api.timecraft.test";
const SIGNING_KEYS = { current: "sig_test_current", next: "sig_test_next" };

export const people = {
	mom: { name: "Ana", email: "ana@example.com", password: "clave-de-ana" },
	dad: { name: "Luis", email: "luis@example.com", password: "clave-de-luis" },
	child: { name: "Mateo", username: "mateo", pin: "123456" },
};

// PGlite is a single connection: a query outside an open transaction waits
// for it to end. Core writes through Better Auth (setPassword) inside its
// transaction, which on Neon is just another connection. In tests, Better
// Auth's queries join the open transaction instead.
function followTransactions(db: Db) {
	const current = new AsyncLocalStorage<Db>();
	const forward = (target: () => Db): ProxyHandler<Db> => ({
		get(_, property) {
			const db = target();
			const value: unknown = Reflect.get(db, property);
			return typeof value === "function" ? value.bind(db) : value;
		},
	});
	const unitOfWorkDb = new Proxy(db, {
		get(target, property, receiver) {
			if (property === "transaction") {
				return (work: (tx: Db) => Promise<unknown>) =>
					target.transaction((tx) => current.run(tx, () => work(tx)));
			}
			return Reflect.get(target, property, receiver);
		},
	});
	const authDb = new Proxy(
		db,
		forward(() => current.getStore() ?? db),
	);
	return { unitOfWorkDb, authDb };
}

// A QStash callback signature, as QStash makes it (an HS256 JWT).
export function signJob(body: string, key = SIGNING_KEYS.current): string {
	const now = Math.floor(Date.now() / 1000);
	const encode = (value: object) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	const unsigned = [
		encode({ alg: "HS256", typ: "JWT" }),
		encode({
			iss: "Upstash",
			sub: jobsUrl(PUBLIC_API_URL),
			iat: now,
			nbf: now,
			exp: now + 300,
			jti: randomUUID(),
			body: createHash("sha256").update(body).digest("base64url"),
		}),
	].join(".");
	const signature = createHmac("sha256", key)
		.update(unsigned)
		.digest("base64url");
	return `${unsigned}.${signature}`;
}

export interface RequestOptions {
	cookie?: string;
	json?: unknown;
	headers?: Record<string, string>;
}

export interface TestAppOptions {
	// Better Auth's per-IP rate limit; off unless a test is about it.
	rateLimit?: boolean;
	google?: { clientId: string; clientSecret: string };
	trustedOrigins?: string[];
}

// The services on any database: what the seed and the app run on.
export function createTestServices(db: Db, options: TestAppOptions = {}) {
	const { unitOfWorkDb, authDb } = followTransactions(db);
	const clock = new FixedClock(NOW);
	const jobs = new FakeJobScheduler();
	const notifier = new FakeNotifier();
	const container = createContainer({
		db: unitOfWorkDb,
		auth: {
			db: authDb,
			baseURL: "http://localhost",
			secret: "test-secret-with-at-least-32-characters",
			rateLimit: options.rateLimit ?? false,
			google: options.google,
			trustedOrigins: options.trustedOrigins,
			silent: true,
		},
		clock,
		jobs,
		notifier,
		jobSignatures: new QStashSignatureVerifier({
			currentSigningKey: SIGNING_KEYS.current,
			nextSigningKey: SIGNING_KEYS.next,
			publicApiUrl: PUBLIC_API_URL,
		}),
	});
	return { ...container, db: unitOfWorkDb, clock, jobs, notifier };
}

// Migrations and seed, once per test run.
let template: Promise<{ client: PGlite; recoveryCode: string | null }> | null =
	null;

function seededTemplate() {
	template ??= (async () => {
		const db = await createTestDb();
		const { auth, core } = createTestServices(db);
		const seeded = await seedHousehold(
			{ db, auth, core },
			{
				familyName: "Familia Pérez",
				parents: [people.mom, people.dad],
				parentPasswords: [people.mom.password, people.dad.password],
				child: people.child,
				policy: { dailyLimitMinutes: 60, weeklyLimitMinutes: 300 },
			},
		);
		return {
			client: db.$client as unknown as PGlite,
			recoveryCode: seeded.recoveryCode,
		};
	})();
	return template;
}

export async function createTestApp(options: TestAppOptions = {}) {
	const seeded = await seededTemplate();
	const client = (await seeded.client.clone()) as PGlite;
	const { app, auth, core, db, clock, jobs, notifier } = createTestServices(
		drizzle({ client, schema }),
		options,
	);
	const [family] = await db.select({ id: parents.familyId }).from(parents);
	if (family === undefined) {
		throw new Error("The template has no family");
	}
	const familyId = family.id;
	const parentId = async (email: string) => {
		const [row] = await db
			.select({ id: parents.id })
			.from(parents)
			.innerJoin(authUser, eq(authUser.id, parents.authUserId))
			.where(eq(authUser.email, email));
		return row?.id ?? "";
	};
	const activityId = async (code: string) => {
		const [row] = await db
			.select({ id: activities.id })
			.from(activities)
			.where(and(eq(activities.familyId, familyId), eq(activities.code, code)));
		return row?.id ?? "";
	};
	const [child] = await db
		.select({ id: children.id, authUserId: children.authUserId })
		.from(children)
		.where(eq(children.familyId, familyId));
	if (child === undefined) {
		throw new Error("The seed did not create the child");
	}
	const ids = {
		familyId,
		momId: await parentId(people.mom.email),
		dadId: await parentId(people.dad.email),
		childId: child.id,
		childAuthUserId: child.authUserId,
		gameId: await activityId("game"),
		tvId: await activityId("tv"),
	};

	async function request(
		method: string,
		path: string,
		options: RequestOptions = {},
	): Promise<Response> {
		const headers: Record<string, string> = { ...options.headers };
		if (options.cookie !== undefined) {
			headers.cookie = options.cookie;
		}
		if (options.json !== undefined) {
			headers["content-type"] = "application/json";
		}
		return app.request(path, {
			method,
			headers,
			...(options.json === undefined
				? {}
				: { body: JSON.stringify(options.json) }),
		});
	}

	// Signs in and returns the session cookie ("name=value").
	async function signIn(
		path: "/api/auth/sign-in/email" | "/api/auth/sign-in/username",
		json: Record<string, string>,
	): Promise<string> {
		const response = await request("POST", path, { json });
		if (response.status !== 200) {
			throw new Error(
				`Sign-in failed (${response.status}): ${await response.text()}`,
			);
		}
		const cookie = response.headers
			.getSetCookie()
			.map((header) => header.split(";")[0] ?? "")
			.find((pair) => pair.includes("session_token="));
		if (cookie === undefined) {
			throw new Error("Sign-in returned no session cookie");
		}
		return cookie;
	}

	return {
		app,
		auth,
		core,
		db,
		clock,
		jobs,
		notifier,
		ids,
		recoveryCode: seeded.recoveryCode,
		request,
		signInParent: (who: "mom" | "dad" = "mom") =>
			signIn("/api/auth/sign-in/email", {
				email: people[who].email,
				password: people[who].password,
			}),
		signInChild: (pin = people.child.pin) =>
			signIn("/api/auth/sign-in/username", {
				username: people.child.username,
				password: pin,
			}),
		// QStash delivering the job of an alert.
		deliverJob(alertId: string, signature?: string) {
			const body = JSON.stringify({ alertId });
			return app.request("/internal/jobs", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"upstash-signature": signature ?? signJob(body),
				},
				body,
			});
		},
	};
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
