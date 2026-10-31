import { describe, expect, test } from "bun:test";
import { InvalidEnvError, parseEnv } from "./env";

const valid = {
	DATABASE_URL: "postgresql://user:secret@host/db?sslmode=require",
	BETTER_AUTH_SECRET: "a".repeat(32),
	BETTER_AUTH_URL: "http://localhost:3000",
	GOOGLE_CLIENT_ID: "",
	GOOGLE_CLIENT_SECRET: "",
	QSTASH_TOKEN: "token",
	QSTASH_CURRENT_SIGNING_KEY: "sig_current",
	QSTASH_NEXT_SIGNING_KEY: "sig_next",
	PUBLIC_API_URL: "https://api.example.com",
	VAPID_PUBLIC_KEY: "public",
	VAPID_PRIVATE_KEY: "private",
	VAPID_SUBJECT: "mailto:padres@example.com",
};

describe("parseEnv", () => {
	test("reads a complete environment; empty optionals are missing", () => {
		const env = parseEnv(valid);
		expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
		expect(env.QSTASH_URL).toBeUndefined();
		expect(env.PUBLIC_API_URL).toBe("https://api.example.com");
	});

	test("names every missing or invalid variable, never its value", () => {
		const attempt = () =>
			parseEnv({
				...valid,
				DATABASE_URL: "mysql://user:secret@host/db",
				BETTER_AUTH_SECRET: "short",
				QSTASH_TOKEN: "  ",
				VAPID_SUBJECT: "padres@example.com",
				GOOGLE_CLIENT_ID: "only-the-id",
			});
		expect(attempt).toThrow(InvalidEnvError);
		let message = "";
		try {
			attempt();
		} catch (error) {
			message = (error as Error).message;
		}
		for (const name of [
			"DATABASE_URL",
			"BETTER_AUTH_SECRET",
			"QSTASH_TOKEN: missing",
			"VAPID_SUBJECT",
			"GOOGLE_CLIENT_SECRET",
		]) {
			expect(message).toContain(name);
		}
		expect(message).not.toContain("secret@host");
		expect(message).not.toContain("only-the-id");
	});

	test("trusted origins are an optional comma-separated list", () => {
		expect(parseEnv(valid).BETTER_AUTH_TRUSTED_ORIGINS).toEqual([]);
		const env = parseEnv({
			...valid,
			BETTER_AUTH_TRUSTED_ORIGINS:
				" https://time-craft-web-*-familia.vercel.app, https://web.example.com ,",
		});
		expect(env.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
			"https://time-craft-web-*-familia.vercel.app",
			"https://web.example.com",
		]);
		expect(() =>
			parseEnv({
				...valid,
				BETTER_AUTH_TRUSTED_ORIGINS: "https://web.example.com/login",
			}),
		).toThrow("BETTER_AUTH_TRUSTED_ORIGINS");
	});

	test("a local PUBLIC_API_URL needs QStash's local server", () => {
		for (const local of [
			"http://localhost:3000",
			"http://api.localhost:3000",
			"http://127.0.0.1:3000",
			"http://[::1]:3000",
		]) {
			expect(() => parseEnv({ ...valid, PUBLIC_API_URL: local })).toThrow(
				"PUBLIC_API_URL",
			);
			expect(() =>
				parseEnv({
					...valid,
					PUBLIC_API_URL: local,
					QSTASH_URL: "https://qstash-us-east-1.upstash.io",
				}),
			).toThrow("PUBLIC_API_URL");
			const env = parseEnv({
				...valid,
				PUBLIC_API_URL: local,
				QSTASH_URL: "http://127.0.0.1:8080",
			});
			expect(env.PUBLIC_API_URL).toBe(local);
		}
	});

	test("Google needs both variables", () => {
		expect(() =>
			parseEnv({ ...valid, GOOGLE_CLIENT_SECRET: "only-the-secret" }),
		).toThrow("GOOGLE_CLIENT_SECRET");
		const env = parseEnv({
			...valid,
			GOOGLE_CLIENT_ID: "id",
			GOOGLE_CLIENT_SECRET: "secret",
		});
		expect(env.GOOGLE_CLIENT_ID).toBe("id");
	});

	test("reads the Firebase service account from its JSON key", () => {
		const env = parseEnv({
			...valid,
			FCM_SERVICE_ACCOUNT: JSON.stringify({
				type: "service_account",
				project_id: "time-craft",
				client_email: "push@time-craft.iam.gserviceaccount.com",
				private_key:
					"-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
			}),
		});
		expect(env.FCM_SERVICE_ACCOUNT).toMatchObject({
			projectId: "time-craft",
			clientEmail: "push@time-craft.iam.gserviceaccount.com",
		});
		expect(parseEnv(valid).FCM_SERVICE_ACCOUNT).toBeUndefined();
		expect(() =>
			parseEnv({ ...valid, FCM_SERVICE_ACCOUNT: "not json" }),
		).toThrow("FCM_SERVICE_ACCOUNT: must be the service account's JSON key");
	});
});
