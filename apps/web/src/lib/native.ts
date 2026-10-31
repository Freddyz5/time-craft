// The Android app (apps/mobile): the same web, loaded inside a native shell
// that adds what a browser cannot do with the screen off. In the app, the
// notifications come from Firebase Cloud Messaging (the app's own plugin,
// TimeCraftPlugin.java) instead of Web Push, Google sign-in uses the phone's
// account picker, and the fingerprint opens the app. In a browser none of
// this runs: every function here checks isNativeApp() first.
import {
	Capacitor,
	type PluginListenerHandle,
	registerPlugin,
} from "@capacitor/core";
import type { AlarmKind, SoundSettings, Volume } from "./sounds";
import type { AlarmWords } from "./voice";

export function isNativeApp(): boolean {
	return Capacitor.isNativePlatform();
}

export interface NativeStatus {
	// Firebase is configured in this build (google-services.json).
	firebase: boolean;
	notifications: "granted" | "denied" | "prompt";
	// Android will not delay the alarms to save battery.
	batteryUnrestricted: boolean;
	// The end of a session may show over the lock screen.
	fullScreen: boolean;
	// Manufacturer and model, for the device's label.
	device: string;
}

// The api's push as the app's messaging service hands it to the web.
export interface NativePush {
	kind: string;
	title: string;
	body: string;
	url: string;
	tag: string;
	data: string;
}

interface TimeCraftPlugin {
	getStatus(): Promise<NativeStatus>;
	requestNotifications(): Promise<NativeStatus>;
	getToken(): Promise<{ token: string }>;
	deleteToken(): Promise<void>;
	setSoundSettings(settings: {
		sounds: Record<AlarmKind, string>;
		repeatEnd: boolean;
		speak: boolean;
		volume: Volume;
	}): Promise<void>;
	ring(options: {
		tag: string;
		kind: AlarmKind;
		title: string;
		body: string;
		url: string;
	}): Promise<void>;
	stopAlarm(options: { tag: string }): Promise<void>;
	speak(options: { text: string; volume: Volume }): Promise<void>;
	openSettings(options: {
		which: "notifications" | "battery" | "fullScreen";
	}): Promise<void>;
	testAlert(options: {
		kind: AlarmKind;
		title: string;
		body: string;
	}): Promise<void>;
	addListener(
		event: "push",
		listener: (push: NativePush) => void,
	): Promise<PluginListenerHandle>;
	addListener(
		event: "token",
		listener: (event: { token: string }) => void,
	): Promise<PluginListenerHandle>;
}

export const timeCraft = registerPlugin<TimeCraftPlugin>("TimeCraft");

// The sounds this phone chose, for the app's notification channels. The
// tab keeps its own copy in localStorage (lib/sounds.ts).
export function syncSoundSettings(settings: SoundSettings): void {
	if (!isNativeApp()) {
		return;
	}
	void timeCraft
		.setSoundSettings({
			sounds: settings.sounds,
			repeatEnd: settings.repeatEnd,
			speak: settings.speak,
			volume: settings.volume,
		})
		.catch(() => undefined);
}

// The phone rings an alarm the tab's timer reached (alarm.ts), under the
// push's tag: when that push arrives seconds later, the phone does not ring
// it again.
export function ringNative(
	tag: string,
	kind: AlarmKind,
	words: AlarmWords | undefined,
): void {
	void timeCraft
		.ring({
			tag,
			kind,
			title: words?.title ?? "Time Craft",
			body: words?.body ?? "",
			url: window.location.pathname.startsWith("/nino") ? "/nino" : "/padres",
		})
		.catch(() => undefined);
}

// Stops the phone's alarm with that tag; if it was the end, the app tells the
// api, which quiets the family's other devices.
export async function stopNativeAlarm(tag: string): Promise<void> {
	await timeCraft.stopAlarm({ tag }).catch(() => undefined);
}

// The web view has no voices: the phone's own (Android's text to speech)
// reads the alarm.
export async function speakNative(text: string, volume: Volume): Promise<void> {
	await timeCraft.speak({ text, volume }).catch(() => undefined);
}

// Pushes that reach the open app: the web refreshes at once. The phone
// already rang them (the app's notification), so the tab stays quiet.
export function onNativePush(listener: (push: NativePush) => void): () => void {
	if (!isNativeApp()) {
		return () => undefined;
	}
	const handle = timeCraft.addListener("push", listener);
	return () => {
		void handle.then((h) => h.remove());
	};
}

// --- Google sign-in -------------------------------------------------------

// Google refuses its sign-in page inside an app's web view, so the app asks
// the phone's account picker for an ID token, which Better Auth checks.
export async function googleIdToken(webClientId: string): Promise<string> {
	const { SocialLogin } = await import("@capgo/capacitor-social-login");
	await SocialLogin.initialize({ google: { webClientId } });
	const response = await SocialLogin.login({ provider: "google", options: {} });
	const result = response.result as {
		responseType?: string;
		idToken?: string | null;
	};
	if (result.responseType !== "online" || !result.idToken) {
		throw new Error("Google returned no ID token");
	}
	return result.idToken;
}

// --- Fingerprint ----------------------------------------------------------

export async function biometricAvailable(): Promise<boolean> {
	if (!isNativeApp()) {
		return false;
	}
	try {
		const { NativeBiometric } = await import(
			"@capgo/capacitor-native-biometric"
		);
		return (await NativeBiometric.isAvailable()).isAvailable;
	} catch {
		return false;
	}
}

// Shows the system's fingerprint prompt; false if cancelled or failed.
export async function verifyFingerprint(reason: string): Promise<boolean> {
	try {
		const { NativeBiometric } = await import(
			"@capgo/capacitor-native-biometric"
		);
		await NativeBiometric.verifyIdentity({
			title: "Time Craft",
			reason,
			subtitle: reason,
			negativeButtonText: "Cancelar",
			maxAttempts: 5,
		});
		return true;
	} catch {
		return false;
	}
}

// The child's username and PIN, kept by Android's Keystore and released only
// by the fingerprint. Never in localStorage.
const CHILD_CREDENTIALS = "timecraft.child";

export async function childCredentialsSaved(): Promise<boolean> {
	if (!(await biometricAvailable())) {
		return false;
	}
	const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
	try {
		return (
			await NativeBiometric.isCredentialsSaved({ server: CHILD_CREDENTIALS })
		).isSaved;
	} catch {
		return false;
	}
}

export async function saveChildCredentials(
	username: string,
	pin: string,
): Promise<void> {
	const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
	await NativeBiometric.setCredentials({
		username,
		password: pin,
		server: CHILD_CREDENTIALS,
	});
}

// Asks for the fingerprint, then returns the saved username and PIN (null if
// cancelled or nothing is saved).
export async function readChildCredentials(): Promise<{
	username: string;
	pin: string;
} | null> {
	if (!(await verifyFingerprint("Entra con tu huella"))) {
		return null;
	}
	const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
	try {
		const saved = await NativeBiometric.getCredentials({
			server: CHILD_CREDENTIALS,
		});
		return { username: saved.username, pin: saved.password };
	} catch {
		return null;
	}
}

export async function forgetChildCredentials(): Promise<void> {
	if (!isNativeApp()) {
		return;
	}
	const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
	await NativeBiometric.deleteCredentials({ server: CHILD_CREDENTIALS }).catch(
		() => undefined,
	);
}

// --- Where the app opens --------------------------------------------------

// The app always starts at the web's root; it goes on to the side this phone
// used last (a parent's or the child's), so the child's phone opens on the
// child's login.
const LAST_AREA = "timecraft:app-area";

export function rememberArea(area: "parent" | "child"): void {
	try {
		window.localStorage.setItem(LAST_AREA, area);
	} catch {
		// Blocked storage: the app opens on the parents' login.
	}
}

export function lastArea(): "parent" | "child" {
	try {
		return window.localStorage.getItem(LAST_AREA) === "child"
			? "child"
			: "parent";
	} catch {
		return "parent";
	}
}
