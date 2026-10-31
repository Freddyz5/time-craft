import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { messages } from "@time-craft/core";
import { nativePushTokens } from "@time-craft/db";
import { createTestApp, type TestApp } from "../testing/harness";
import { FcmNotifier, type FcmServiceAccount } from "./fcm";

let t: TestApp;
let account: FcmServiceAccount;

beforeEach(async () => {
	t = await createTestApp();
	await t.db.insert(nativePushTokens).values(
		["ok", "gone", "broken"].map((name) => ({
			authUserId: t.ids.childAuthUserId,
			token: `token-${name}`,
		})),
	);
	const keys = await crypto.subtle.generateKey(
		{
			name: "RSASSA-PKCS1-v1_5",
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["sign", "verify"],
	);
	const der = new Uint8Array(
		await crypto.subtle.exportKey("pkcs8", keys.privateKey),
	);
	const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64")}\n-----END PRIVATE KEY-----\n`;
	account = {
		projectId: "time-craft",
		clientEmail: "push@time-craft.iam.gserviceaccount.com",
		privateKey: pem,
	};
});

afterEach(() => {
	mock.restore();
});

const message = messages.sessionReady({
	sessionId: "session-1",
	activityName: "Juego",
	minutes: 30,
});

interface Call {
	url: string;
	body: string;
	authorization: string | null;
}

function fakeGoogle(calls: Call[]) {
	return async (url: string, init: RequestInit) => {
		const headers = new Headers(init.headers);
		calls.push({
			url,
			body: String(init.body),
			authorization: headers.get("authorization"),
		});
		if (url === "https://oauth2.googleapis.com/token") {
			return Response.json({ access_token: "access-1", expires_in: 3600 });
		}
		const token = JSON.parse(String(init.body)).message.token as string;
		if (token === "token-gone") {
			return Response.json(
				{
					error: {
						status: "NOT_FOUND",
						details: [{ errorCode: "UNREGISTERED" }],
					},
				},
				{ status: 404 },
			);
		}
		if (token === "token-broken") {
			return Response.json({ error: { status: "INTERNAL" } }, { status: 500 });
		}
		return Response.json({ name: "projects/time-craft/messages/1" });
	};
}

describe("FcmNotifier", () => {
	test("sends a data message to every token and deletes the dead ones", async () => {
		const calls: Call[] = [];
		const notifier = new FcmNotifier(t.db, account, fakeGoogle(calls));
		const logged = spyOn(console, "error").mockImplementation(() => {});

		await notifier.send([t.ids.childAuthUserId], message);

		const [tokenCall, ...sends] = calls;
		expect(tokenCall?.url).toBe("https://oauth2.googleapis.com/token");
		expect(tokenCall?.body).toContain(
			"grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer",
		);
		expect(sends).toHaveLength(3);
		for (const send of sends) {
			expect(send.url).toBe(
				"https://fcm.googleapis.com/v1/projects/time-craft/messages:send",
			);
			expect(send.authorization).toBe("Bearer access-1");
		}
		const sent = JSON.parse(sends[0]?.body ?? "{}").message;
		expect(sent.android).toEqual({ priority: "HIGH", ttl: "900s" });
		expect(sent.notification).toBeUndefined();
		expect(sent.data).toEqual({
			kind: "session_ready",
			title: message.title,
			body: message.body,
			url: "/nino",
			tag: "session-session-1",
			data: JSON.stringify({ sessionId: "session-1" }),
		});

		const left = await t.db.select().from(nativePushTokens);
		expect(left.map((row) => row.token).sort()).toEqual([
			"token-broken",
			"token-ok",
		]);
		expect(left.find((row) => row.token === "token-ok")?.lastUsedAt).not.toBe(
			null,
		);
		// The broken send is logged without the token.
		expect(logged).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(logged.mock.calls)).not.toContain("token-broken");
	});

	test("reuses the access token until it expires", async () => {
		const calls: Call[] = [];
		let now = 1_000_000;
		const notifier = new FcmNotifier(
			t.db,
			account,
			fakeGoogle(calls),
			() => now,
		);
		spyOn(console, "error").mockImplementation(() => {});
		await notifier.send([t.ids.childAuthUserId], message);
		await notifier.send([t.ids.childAuthUserId], message);
		const tokenCalls = () =>
			calls.filter((call) => call.url.includes("oauth2")).length;
		expect(tokenCalls()).toBe(1);
		now += 3600 * 1000;
		await notifier.send([t.ids.childAuthUserId], message);
		expect(tokenCalls()).toBe(2);
	});

	test("does nothing for people without the app", async () => {
		const calls: Call[] = [];
		const notifier = new FcmNotifier(t.db, account, fakeGoogle(calls));
		await notifier.send(["someone-without-the-app"], message);
		await notifier.send([], message);
		expect(calls).toHaveLength(0);
	});
});
