// Web Push on this browser: the service worker, the permission and the
// subscription the api sends notifications to. On Android, Chrome delivers
// them without installing the app.
import { VAPID_PUBLIC_KEY } from "astro:env/client";
import { api, call } from "./api";
import { labelFromUserAgent } from "./device";

export type PushState =
	| "unsupported" // no service worker or Push API (or no VAPID key configured)
	| "denied" // the person blocked notifications for the site
	| "off" // allowed or not asked yet, but this browser is not subscribed
	| "on";

export function pushSupported(): boolean {
	return (
		typeof window !== "undefined" &&
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window &&
		Boolean(VAPID_PUBLIC_KEY)
	);
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (!("serviceWorker" in navigator)) {
		return null;
	}
	try {
		return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
	} catch {
		return null;
	}
}

async function currentSubscription(): Promise<PushSubscription | null> {
	const registration = await navigator.serviceWorker.getRegistration("/");
	return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
	if (!pushSupported()) {
		return "unsupported";
	}
	if (Notification.permission === "denied") {
		return "denied";
	}
	if (Notification.permission !== "granted") {
		return "off";
	}
	return (await currentSubscription()) === null ? "off" : "on";
}

function applicationServerKey(base64Url: string): Uint8Array<ArrayBuffer> {
	const padded = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4))
		.replaceAll("-", "+")
		.replaceAll("_", "/");
	const raw = atob(padded);
	const bytes = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) {
		bytes[i] = raw.charCodeAt(i);
	}
	return bytes;
}

export function deviceLabel(): string {
	return labelFromUserAgent(navigator.userAgent);
}

// Asks for permission (it must follow a tap) and registers the subscription
// with the api for whoever is signed in.
export async function enablePush(): Promise<PushState> {
	if (!pushSupported() || VAPID_PUBLIC_KEY === undefined) {
		return "unsupported";
	}
	const permission = await Notification.requestPermission();
	if (permission === "denied") {
		return "denied";
	}
	if (permission !== "granted") {
		return "off";
	}
	const registration =
		(await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
	await navigator.serviceWorker.ready;
	const subscription =
		(await registration.pushManager.getSubscription()) ??
		(await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: applicationServerKey(VAPID_PUBLIC_KEY),
		}));
	const json = subscription.toJSON();
	await call(
		api["push-subscriptions"].$post({
			json: {
				endpoint: subscription.endpoint,
				keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
				deviceLabel: deviceLabel(),
			},
		}),
	);
	return "on";
}

export async function disablePush(): Promise<PushState> {
	const subscription = await currentSubscription();
	if (subscription !== null) {
		// Tell the api first, while the session still exists.
		await call(
			api["push-subscriptions"].$delete({
				json: { endpoint: subscription.endpoint },
			}),
		).catch(() => undefined);
		await subscription.unsubscribe();
	}
	return pushState();
}

// Pushes arriving while a tab is open: the service worker forwards them so
// the app can refresh at once instead of waiting for its next poll.
export function onPushMessage(listener: (kind: string) => void): () => void {
	if (!("serviceWorker" in navigator)) {
		return () => undefined;
	}
	const handler = (event: MessageEvent) => {
		const data: unknown = event.data;
		if (
			typeof data === "object" &&
			data !== null &&
			"type" in data &&
			data.type === "push"
		) {
			listener(
				"kind" in data && typeof data.kind === "string" ? data.kind : "",
			);
		}
	};
	navigator.serviceWorker.addEventListener("message", handler);
	return () => navigator.serviceWorker.removeEventListener("message", handler);
}
