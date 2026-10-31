// Firebase Cloud Messaging (HTTP v1) for the Android app. Like Web Push, it
// runs after the use case committed (core ignores its errors), so it logs
// failures, and deletes tokens FCM no longer knows (the app was uninstalled
// or its data cleared).
//
// Every message is data only: the app's own messaging service builds the
// notification, so it can use the device's sounds and ring the end of a
// session as an alarm even with the app closed.
import type { Notifier, PushMessage } from "@time-craft/core";
import { type Db, nativePushTokens } from "@time-craft/db";
import { eq, inArray } from "drizzle-orm";

// What the api needs from the service account's JSON key (Firebase console ›
// Project settings › Service accounts).
export interface FcmServiceAccount {
	projectId: string;
	clientEmail: string;
	privateKey: string;
}

// A message nobody received within 15 minutes is stale, as with Web Push.
const TTL_SECONDS = 15 * 60;
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
// FCM's error codes for a token that will never work again.
const DEAD_TOKEN_CODES = new Set(["UNREGISTERED", "SENDER_ID_MISMATCH"]);

// The data the app receives: every value is a string, as FCM requires.
export interface FcmData {
	kind: string;
	title: string;
	body: string;
	url: string;
	tag: string;
	// The message's own data, as JSON.
	data: string;
}

export function fcmData(message: PushMessage): FcmData {
	return {
		kind: message.kind,
		title: message.title,
		body: message.body,
		url: message.url,
		tag: message.tag,
		data: JSON.stringify(message.data),
	};
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export class FcmNotifier implements Notifier {
	private accessToken: { value: string; expiresAt: number } | null = null;

	constructor(
		private readonly db: Db,
		private readonly account: FcmServiceAccount,
		private readonly fetchFn: Fetch = (input, init) => fetch(input, init),
		private readonly nowMs: () => number = () => Date.now(),
	) {}

	async send(
		authUserIds: readonly string[],
		message: PushMessage,
	): Promise<void> {
		if (authUserIds.length === 0) {
			return;
		}
		const tokens = await this.db
			.select()
			.from(nativePushTokens)
			.where(inArray(nativePushTokens.authUserId, [...authUserIds]));
		if (tokens.length === 0) {
			return;
		}
		let accessToken: string;
		try {
			accessToken = await this.getAccessToken();
		} catch (error) {
			console.error("Could not get an FCM access token", error);
			return;
		}
		const data = fcmData(message);
		await Promise.all(
			tokens.map(async (row) => {
				const sent = await this.sendOne(accessToken, row.token, data);
				if (sent === "dead") {
					await this.db
						.delete(nativePushTokens)
						.where(eq(nativePushTokens.token, row.token))
						.catch((error: unknown) =>
							console.error("Could not delete a stale app token", error),
						);
				} else if (sent === "ok") {
					await this.db
						.update(nativePushTokens)
						.set({ lastUsedAt: new Date(this.nowMs()) })
						.where(eq(nativePushTokens.id, row.id))
						.catch((error: unknown) =>
							console.error("Could not update an app token", error),
						);
				}
			}),
		);
	}

	private async sendOne(
		accessToken: string,
		token: string,
		data: FcmData,
	): Promise<"ok" | "dead" | "failed"> {
		let response: Response;
		try {
			response = await this.fetchFn(
				`https://fcm.googleapis.com/v1/projects/${this.account.projectId}/messages:send`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${accessToken}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						message: {
							token,
							data,
							android: { priority: "HIGH", ttl: `${TTL_SECONDS}s` },
						},
					}),
				},
			);
		} catch (error) {
			console.error("FCM send failed", error);
			return "failed";
		}
		if (response.ok) {
			return "ok";
		}
		const code = await errorCode(response);
		if (DEAD_TOKEN_CODES.has(code)) {
			return "dead";
		}
		// Never log the token: it is the app's address.
		console.error("FCM send failed", { status: response.status, code });
		return "failed";
	}

	// An OAuth access token for FCM, from a JWT signed with the service
	// account's key. Cached until a minute before it expires.
	private async getAccessToken(): Promise<string> {
		const now = this.nowMs();
		if (this.accessToken !== null && this.accessToken.expiresAt > now) {
			return this.accessToken.value;
		}
		const assertion = await signJwt(this.account, Math.floor(now / 1000));
		const response = await this.fetchFn(TOKEN_URL, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
				assertion,
			}).toString(),
		});
		if (!response.ok) {
			throw new Error(`Google's token endpoint answered ${response.status}`);
		}
		const body = (await response.json()) as {
			access_token?: string;
			expires_in?: number;
		};
		if (typeof body.access_token !== "string") {
			throw new Error("Google's token endpoint returned no access_token");
		}
		const lifetimeMs = (body.expires_in ?? 3600) * 1000;
		this.accessToken = {
			value: body.access_token,
			expiresAt: now + lifetimeMs - 60_000,
		};
		return body.access_token;
	}
}

// FCM's error code (details[].errorCode, else the status name).
async function errorCode(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as {
			error?: { status?: string; details?: { errorCode?: string }[] };
		};
		const detail = body.error?.details?.find(
			(entry) => typeof entry.errorCode === "string",
		);
		return detail?.errorCode ?? body.error?.status ?? "";
	} catch {
		return "";
	}
}

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

function base64UrlJson(value: unknown): string {
	return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

// The PKCS#8 key of the service account, from its PEM text.
function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
	const base64 = pem
		.replace(/-----BEGIN PRIVATE KEY-----/, "")
		.replace(/-----END PRIVATE KEY-----/, "")
		.replace(/\s+/g, "");
	const raw = atob(base64);
	const bytes = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) {
		bytes[i] = raw.charCodeAt(i);
	}
	return bytes;
}

export async function signJwt(
	account: FcmServiceAccount,
	issuedAt: number,
): Promise<string> {
	const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
	const claims = base64UrlJson({
		iss: account.clientEmail,
		sub: account.clientEmail,
		aud: TOKEN_URL,
		scope: SCOPE,
		iat: issuedAt,
		exp: issuedAt + 3600,
	});
	const key = await crypto.subtle.importKey(
		"pkcs8",
		pemToDer(account.privateKey),
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		key,
		new TextEncoder().encode(`${header}.${claims}`),
	);
	return `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
}
