// The QStash adapters against a fake QStash server (the SDK's baseUrl), and
// the signature check against tokens signed like QStash signs them.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { signJob } from "../testing/harness";
import { jobsUrl, QStashJobScheduler, QStashSignatureVerifier } from "./qstash";

interface Received {
	method: string;
	path: string;
	headers: Record<string, string>;
	body: string;
}

const received: Received[] = [];
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
	server = Bun.serve({
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			received.push({
				method: request.method,
				path: decodeURIComponent(url.pathname),
				headers: Object.fromEntries(request.headers),
				body: await request.text(),
			});
			if (url.pathname.startsWith("/v2/publish/")) {
				return Response.json({ messageId: "msg_123" });
			}
			// Cancelling a message that was already delivered.
			return Response.json({ error: "message not found" }, { status: 404 });
		},
	});
});

afterAll(() => {
	server.stop(true);
});

const config = {
	token: "test-token",
	currentSigningKey: "sig_test_current",
	nextSigningKey: "sig_test_next",
	publicApiUrl: "https://api.timecraft.test",
};

describe("QStashJobScheduler", () => {
	test("publishes the alert id to /internal/jobs, not before its time", async () => {
		const scheduler = new QStashJobScheduler({
			...config,
			baseUrl: server.url.origin,
		});
		const messageId = await scheduler.schedule({
			alertId: "alert-1",
			alertType: "warning",
			runAt: new Date("2026-10-21T20:55:00.400Z"),
		});
		expect(messageId).toBe("msg_123");
		const [publish] = received;
		expect(publish).toMatchObject({
			method: "POST",
			path: "/v2/publish/https://api.timecraft.test/internal/jobs",
			body: JSON.stringify({ alertId: "alert-1" }),
		});
		expect(publish?.headers.authorization).toBe("Bearer test-token");
		// Rounded up to the next second.
		expect(publish?.headers["upstash-not-before"]).toBe(
			String(Date.parse("2026-10-21T20:55:01Z") / 1000),
		);
		expect(publish?.headers["upstash-retries"]).toBe("3");
	});

	test("cancelling a message that is gone does not fail", async () => {
		const scheduler = new QStashJobScheduler({
			...config,
			baseUrl: server.url.origin,
		});
		await scheduler.cancel("msg_gone");
		expect(received.at(-1)).toMatchObject({
			method: "DELETE",
			path: "/v2/messages/msg_gone",
		});
	});
});

describe("QStashSignatureVerifier", () => {
	const verifier = new QStashSignatureVerifier(config);
	const body = JSON.stringify({ alertId: "alert-1" });

	test("accepts either signing key, for the body and URL signed", async () => {
		expect(jobsUrl(config.publicApiUrl)).toBe(
			"https://api.timecraft.test/internal/jobs",
		);
		expect(await verifier.verify({ body, signature: signJob(body) })).toBe(
			true,
		);
		expect(
			await verifier.verify({
				body,
				signature: signJob(body, "sig_test_next"),
			}),
		).toBe(true);
	});

	test("rejects another key, another body or garbage", async () => {
		expect(
			await verifier.verify({ body, signature: signJob(body, "sig_other") }),
		).toBe(false);
		expect(
			await verifier.verify({ body: "{}", signature: signJob(body) }),
		).toBe(false);
		expect(await verifier.verify({ body, signature: "not-a-jwt" })).toBe(false);
	});
});
