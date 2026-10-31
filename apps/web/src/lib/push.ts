// Web Push on this browser: the service worker, the permission and the
// subscription the api sends notifications to. On Android, Chrome delivers
// them without installing the app. Inside the Android app (lib/native.ts)
// the same switch registers the app's Firebase token instead.
import { VAPID_PUBLIC_KEY } from "astro:env/client";
import { useCallback, useEffect, useState } from "react";
import { api, call } from "./api";
import { labelFromUserAgent } from "./device";
import { isNativeApp, timeCraft } from "./native";

export type PushState =
	| "unsupported" // no service worker or Push API (or no VAPID key configured)
	| "denied" // the person blocked notifications for the site
	| "off" // allowed or not asked yet, but this browser is not subscribed
	| "on";

export function pushSupported(): boolean {
	if (isNativeApp()) {
		return true;
	}
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
	if (isNativeApp()) {
		return nativePushState();
	}
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
	if (isNativeApp()) {
		return enableNativePush();
	}
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
	if (isNativeApp()) {
		return disableNativePush();
	}
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

// --- The Android app ------------------------------------------------------

// The token this app registered with the api, so the switch knows it is on
// and sign-out can remove it.
const NATIVE_TOKEN = "timecraft:app-push-token";

function storedNativeToken(): string | null {
	try {
		return window.localStorage.getItem(NATIVE_TOKEN);
	} catch {
		return null;
	}
}

function storeNativeToken(token: string | null): void {
	try {
		if (token === null) {
			window.localStorage.removeItem(NATIVE_TOKEN);
		} else {
			window.localStorage.setItem(NATIVE_TOKEN, token);
		}
	} catch {
		// Blocked storage: the switch shows "off" next time.
	}
}

async function nativePushState(): Promise<PushState> {
	const status = await timeCraft.getStatus().catch(() => null);
	if (status === null || !status.firebase) {
		return "unsupported";
	}
	if (status.notifications === "denied") {
		return "denied";
	}
	return status.notifications === "granted" && storedNativeToken() !== null
		? "on"
		: "off";
}

async function registerNativeToken(token: string): Promise<void> {
	const status = await timeCraft.getStatus();
	await call(
		api["native-push-tokens"].$post({
			json: {
				token,
				platform: "android",
				deviceLabel: `App en ${status.device}`.slice(0, 100),
			},
		}),
	);
	storeNativeToken(token);
}

async function enableNativePush(): Promise<PushState> {
	const status = await timeCraft.requestNotifications();
	if (!status.firebase) {
		return "unsupported";
	}
	if (status.notifications !== "granted") {
		return status.notifications === "denied" ? "denied" : "off";
	}
	const { token } = await timeCraft.getToken();
	await registerNativeToken(token);
	return "on";
}

async function disableNativePush(): Promise<PushState> {
	const token = storedNativeToken();
	if (token !== null) {
		// Tell the api first, while the session still exists.
		await call(api["native-push-tokens"].$delete({ json: { token } })).catch(
			() => undefined,
		);
		storeNativeToken(null);
		await timeCraft.deleteToken().catch(() => undefined);
	}
	return nativePushState();
}

// On every start of the app: Firebase may have rotated the token since it
// was registered. Does nothing in a browser or while the switch is off.
export async function refreshNativeToken(): Promise<void> {
	const stored = storedNativeToken();
	if (!isNativeApp() || stored === null) {
		return;
	}
	const { token } = await timeCraft.getToken();
	if (token !== stored) {
		await registerNativeToken(token);
		await call(
			api["native-push-tokens"].$delete({ json: { token: stored } }),
		).catch(() => undefined);
	}
}

// A push as the service worker forwards it to an open tab.
export interface TabPush {
	kind: string;
	title: string;
	body: string;
	tag: string;
	data: Readonly<Record<string, string>>;
	// The one tab that rings for it (the others only refresh).
	ring: boolean;
}

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function tabPush(message: Record<string, unknown>): TabPush {
	const data: Record<string, string> = {};
	if (typeof message.data === "object" && message.data !== null) {
		for (const [key, value] of Object.entries(message.data)) {
			if (typeof value === "string") {
				data[key] = value;
			}
		}
	}
	return {
		kind: text(message.kind),
		title: text(message.title),
		body: text(message.body),
		tag: text(message.tag),
		data,
		// A service worker from before this field rang every tab.
		ring: message.ring !== false,
	};
}

// Pushes arriving while a tab is open: the service worker forwards them so
// the app can refresh at once instead of waiting for its next poll, and ring.
export function onPushMessage(listener: (push: TabPush) => void): () => void {
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
			listener(tabPush(data as Record<string, unknown>));
		}
	};
	navigator.serviceWorker.addEventListener("message", handler);
	return () => navigator.serviceWorker.removeEventListener("message", handler);
}

// This browser's push state, read once on mount; `refresh` reads it again.
export function usePushState() {
	const [state, setState] = useState<PushState | null>(null);
	const refresh = useCallback(() => {
		void pushState().then(setState);
	}, []);
	useEffect(refresh, [refresh]);
	return { state, setState, refresh };
}
