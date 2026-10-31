// The open tab's own alarm: the sound this device picked (sounds.ts), a
// vibration and, if this device talks, the alarm's words read out (voice.ts),
// at the exact second of the warning and of the end (and, on the child's
// side, when a scheduled session lets them start or a parent says yes), and
// whenever a push reaches an open tab (PushAlarm in providers.tsx).
// It complements push, which Android may delay; it does not replace it, since
// Android freezes background tabs. A computer keeps a background tab running,
// so there a tab left open rings even behind a game.
// Inside the Android app the phone rings instead (ringNative in native.ts), at
// the same moments, with the same sound and words.
// Stopping the end here stops it on the family's other devices too (the api
// pushes alarm_stopped to them).
import { useEffect, useRef, useSyncExternalStore } from "react";
import { api, call } from "./api";
import { serverNow } from "./clock";
import { isNativeApp, ringNative, stopNativeAlarm } from "./native";
import { pushState } from "./push";
import {
	type AlarmKind,
	readSoundSettings,
	SOUNDS,
	type SoundId,
	type SoundSettings,
	soundSeconds,
	type Tone,
	type Volume,
} from "./sounds";
import { type AlarmWords, speak, stopSpeaking } from "./voice";

export type { AlarmKind } from "./sounds";
export type { AlarmWords } from "./voice";

let audio: AudioContext | null = null;
// Every note goes through a limiter: notes that overlap at a high volume
// stay loud without clipping.
let output: AudioNode | null = null;

const soundListeners = new Set<() => void>();

function notifySound(): void {
	for (const listener of soundListeners) {
		listener();
	}
}

function context(): AudioContext | null {
	if (audio === null) {
		try {
			audio = new AudioContext();
		} catch {
			// No Web Audio: the vibration and the banner still work.
			return null;
		}
		const limiter = audio.createDynamicsCompressor();
		limiter.threshold.value = -6;
		limiter.knee.value = 0;
		limiter.ratio.value = 20;
		limiter.attack.value = 0.003;
		limiter.release.value = 0.25;
		limiter.connect(audio.destination);
		output = limiter;
		audio.addEventListener("statechange", notifySound);
		notifySound();
	}
	return audio;
}

// Browsers only let a page make sound after a tap. It is tried once at once
// (it works where the browser allows sound on its own, as with Time Craft
// installed as an app on a computer), then on every tap or key while it is
// still off: the system may suspend it again.
export function unlockAudioOnTap(): () => void {
	const unlock = () => {
		const ctx = context();
		if (ctx !== null && ctx.state !== "running") {
			void ctx.resume().catch(() => undefined);
		}
	};
	unlock();
	window.addEventListener("pointerdown", unlock);
	window.addEventListener("keydown", unlock);
	return () => {
		window.removeEventListener("pointerdown", unlock);
		window.removeEventListener("keydown", unlock);
	};
}

// "unsupported": no Web Audio. "locked": it waits for a tap. "ready": it can
// ring now.
export type SoundState = "unsupported" | "locked" | "ready";

function soundState(): SoundState {
	if (typeof AudioContext === "undefined") {
		return "unsupported";
	}
	return audio?.state === "running" ? "ready" : "locked";
}

export function useSoundState(): SoundState {
	return useSyncExternalStore(
		(listener) => {
			soundListeners.add(listener);
			return () => soundListeners.delete(listener);
		},
		soundState,
		() => "locked",
	);
}

// The loudest moment of each note. "medium" is how the tab always sounded.
const PEAK: Record<Volume, number> = { low: 0.1, medium: 0.25, high: 0.6 };

function play(id: SoundId, volume: Volume): void {
	const ctx = audio;
	if (ctx === null || ctx.state !== "running" || output === null) {
		return;
	}
	if (id === "none") {
		return;
	}
	const destination = output;
	const start = ctx.currentTime + 0.05;
	for (const tone of SOUNDS[id].tones as readonly Tone[]) {
		const at = start + tone.at;
		const peak = PEAK[volume] * tone.level;
		const attack = tone.attack ?? 0.02;
		const end = at + tone.hold + tone.fade;
		const oscillator = ctx.createOscillator();
		const gain = ctx.createGain();
		oscillator.type = tone.wave;
		oscillator.frequency.setValueAtTime(tone.hz, at);
		for (const [after, hz] of tone.glide ?? []) {
			oscillator.frequency.linearRampToValueAtTime(hz, at + after);
		}
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(peak, at + attack);
		if (tone.hold > attack) {
			gain.gain.setValueAtTime(peak, at + tone.hold);
		}
		gain.gain.exponentialRampToValueAtTime(0.0001, end);
		oscillator.connect(gain).connect(destination);
		oscillator.start(at);
		oscillator.stop(end + 0.1);
	}
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const VIBRATION: Record<AlarmKind, number[]> = {
	warning: [180, 120, 180],
	end: [400, 150, 400, 150, 400],
	ready: [120, 80, 120, 80, 260],
	answer: [90, 60, 90],
	notice: [120, 80, 120],
};

function vibrate(kind: AlarmKind): void {
	try {
		navigator.vibrate?.(VIBRATION[kind]);
	} catch {
		// Not allowed before a tap, or not available.
	}
}

// Which ringing is current: a tap during the end, or a newer end, silences
// the older one, voice included.
let ringing = 0;

// The sound, the vibration and then, if this device talks, the words.
// Resolves when all of it is over.
async function sound(
	kind: AlarmKind,
	words: AlarmWords | undefined,
	settings: SoundSettings,
	ticket: number,
): Promise<void> {
	const id = settings.sounds[kind];
	play(id, settings.volume);
	vibrate(kind);
	await wait(soundSeconds(id) * 1000);
	if (settings.speak && words !== undefined && ticket === ringing) {
		await speak(words, settings.voice, settings.volume);
	}
}

// The end, again and again, until someone touches the page or a while has
// passed with nobody there. Each time starts 5 seconds after the one before,
// or a moment after it ends if its voice took longer.
const REPEAT_EVERY_MS = 5_000;
const REPEAT_GAP_MS = 1_500;
const REPEAT_FOR_MS = 5 * 60_000;

let stopRepeating: (() => void) | null = null;
// The push tag of the end that keeps ringing here, if one does.
let repeatingTag: string | null = null;

function silence(): void {
	ringing += 1;
	stopSpeaking();
	stopRepeating?.();
	stopRepeating = null;
	repeatingTag = null;
}

// Someone here noticed the end: quiet here and on the family's other devices.
export function stopRinging(): void {
	const tag = repeatingTag;
	silence();
	if (tag !== null) {
		stopEverywhere(tag);
	}
}

// Another device stopped this end (its alarm_stopped push): quiet here only.
export function stopRingingFromPush(tag: string): void {
	if (tag === repeatingTag) {
		silence();
	}
}

function stopEverywhere(tag: string): void {
	const sessionId = /^session-(.+)$/.exec(tag)?.[1];
	if (sessionId === undefined) {
		return;
	}
	void call(
		api.sessions[":sessionId"]["stop-alarm"].$post({ param: { sessionId } }),
	).catch(() => undefined);
}

function keepRinging(
	first: Promise<void>,
	words: AlarmWords | undefined,
	ticket: number,
	tag: string,
): void {
	repeatingTag = tag;
	const until = Date.now() + REPEAT_FOR_MS;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const after = (started: number, done: Promise<void>) => {
		void done.then(() => {
			if (ticket !== ringing) {
				return;
			}
			const elapsed = Date.now() - started;
			timer = setTimeout(
				again,
				Math.max(REPEAT_GAP_MS, REPEAT_EVERY_MS - elapsed),
			);
		});
	};
	const again = () => {
		if (ticket !== ringing) {
			return;
		}
		if (Date.now() >= until) {
			silence();
			return;
		}
		// The voice only says the title again: "Se acabó el tiempo".
		const title = words && { title: words.title };
		after(Date.now(), sound("end", title, readSoundSettings(), ticket));
	};
	after(Date.now(), first);
	// A tap or a key anywhere means someone noticed (closing the alarm toast
	// is a tap too).
	window.addEventListener("pointerdown", stopRinging, true);
	window.addEventListener("keydown", stopRinging, true);
	stopRepeating = () => {
		clearTimeout(timer);
		window.removeEventListener("pointerdown", stopRinging, true);
		window.removeEventListener("keydown", stopRinging, true);
	};
}

function ring(
	tag: string,
	kind: AlarmKind,
	words: AlarmWords | undefined,
): void {
	if (isNativeApp()) {
		ringNative(tag, kind, words);
		stopNativeOnTap(tag);
		return;
	}
	const settings = readSoundSettings();
	const repeat = kind === "end" && settings.repeatEnd;
	if (repeat) {
		silence();
	}
	const ticket = ringing;
	const done = sound(kind, words, settings, ticket);
	if (repeat) {
		keepRinging(done, words, ticket, tag);
	}
}

// In the Android app the phone rings; a tap or a key here means someone
// noticed, as in the tab.
let nativeTap: (() => void) | null = null;

function stopNativeOnTap(tag: string): void {
	nativeTap?.();
	const stop = () => {
		nativeTap?.();
		void stopNativeAlarm(tag);
	};
	window.addEventListener("pointerdown", stop, true);
	window.addEventListener("keydown", stop, true);
	nativeTap = () => {
		window.removeEventListener("pointerdown", stop, true);
		window.removeEventListener("keydown", stop, true);
		nativeTap = null;
	};
}

// What rang lately, by push tag (a session, a request or a report: the api's
// `session-…`, `request-…`, `report-…`) and kind: the tab's own timer and the
// push that follows it seconds later ring once, whichever comes first.
const recent = new Map<string, number>();
const SAME_ALARM_MS = 3 * 60_000;

// Rings unless this alarm already rang here; says whether it did. `onRing`
// runs only if it rings: it shows the alarm on the page and returns the
// words the voice says.
export function ringOnce(
	tag: string,
	kind: AlarmKind,
	onRing?: () => AlarmWords | undefined,
): boolean {
	const key = `${tag}:${kind}`;
	const now = Date.now();
	const last = recent.get(key);
	if (last !== undefined && now - last < SAME_ALARM_MS) {
		return false;
	}
	recent.set(key, now);
	ring(tag, kind, onRing?.());
	return true;
}

// "Probar": a tap unlocks the sound, then it plays once, as picked.
export async function testSound(
	id: SoundId,
	volume: Volume,
	kind: AlarmKind,
): Promise<void> {
	try {
		await context()?.resume();
	} catch {
		// No Web Audio: the vibration still works.
	}
	play(id, volume);
	vibrate(kind);
}

// "Probar" for the voice: the words, with the picked voice.
export async function testVoice(
	words: AlarmWords,
	voice: string | null,
	volume: Volume,
): Promise<void> {
	await speak(words, voice, volume);
}

// A hidden tab stops polling, so it misses a pause or a change. When this
// browser gets push, the server's own push rings the tab instead (it is
// only sent if the alarm still holds); without push, the timer rings anyway.
export async function pushWillRing(): Promise<boolean> {
	if (isNativeApp()) {
		// In the Android app the tab's timer rings the phone at the exact
		// second, and the phone ignores the push that follows for it.
		return false;
	}
	return document.visibilityState === "hidden" && (await pushState()) === "on";
}

// What a push means for the tab's alarm. The kinds are the api's
// notification kinds.
const PUSH_ALARMS: Readonly<Record<string, AlarmKind>> = {
	session_ready: "ready",
	session_warning: "warning",
	session_ended: "end",
	session_auto_closed: "notice",
	session_cancelled_no_time: "notice",
	request_created: "notice",
	request_approved: "answer",
	request_rejected: "notice",
	report_created: "notice",
	report_approved: "answer",
	report_rejected: "notice",
};

export function alarmForPush(kind: string): AlarmKind | null {
	return Object.hasOwn(PUSH_ALARMS, kind) ? (PUSH_ALARMS[kind] ?? null) : null;
}

// Alarms already handled, so a refetch or a remount does not ring them
// twice. The key includes the planned end: after a pause the end moves and
// the alarms are due again, as the server reschedules its own.
const rung = new Set<string>();

// How late an alarm may still ring (the tab was asleep, the poll was late).
const GRACE_MS = 20_000;

export interface AlarmPlan {
	sessionId: string;
	// When the running session reaches its planned end (server clock, from
	// timer.ts); null if it is not running.
	endsAtMs: number | null;
	warningMinutes: number;
}

// `onRing` shows the alarm on the page and returns the words the voice says.
export function useSessionAlarm(
	plan: AlarmPlan | null,
	onRing: (kind: AlarmKind) => AlarmWords,
): void {
	const onRingRef = useRef(onRing);
	onRingRef.current = onRing;
	const sessionId = plan?.sessionId ?? null;
	const end = plan?.endsAtMs ?? null;
	const warningMinutes = plan?.warningMinutes ?? 0;

	useEffect(() => {
		if (sessionId === null || end === null) {
			return;
		}
		const moments: [AlarmKind, number][] = [["end", end]];
		if (warningMinutes > 0) {
			moments.push(["warning", end - warningMinutes * 60_000]);
		}
		const timers = moments.map(([kind, at]) => {
			const key = `${sessionId}:${kind}:${end}`;
			const fire = async () => {
				if (rung.has(key)) {
					return;
				}
				rung.add(key);
				if (await pushWillRing()) {
					return;
				}
				ringOnce(`session-${sessionId}`, kind, () => onRingRef.current(kind));
			};
			const delay = at - serverNow();
			if (delay < -GRACE_MS) {
				// Long past (the page opened later): the push already said it.
				rung.add(key);
				return null;
			}
			return setTimeout(() => void fire(), Math.max(0, delay));
		});
		return () => {
			for (const timer of timers) {
				if (timer !== null) {
					clearTimeout(timer);
				}
			}
		};
	}, [sessionId, end, warningMinutes]);
}

// Whether this device points with a mouse or a trackpad: a computer, where a
// tab left open keeps ringing in the background.
const FINE_POINTER = "(pointer: fine)";

export function useFinePointer(): boolean {
	return useSyncExternalStore(
		(listener) => {
			const media = window.matchMedia(FINE_POINTER);
			media.addEventListener("change", listener);
			return () => media.removeEventListener("change", listener);
		},
		() => window.matchMedia(FINE_POINTER).matches,
		() => false,
	);
}

// While an alarm is pending on a computer, closing or reloading the tab asks
// first: a closed tab cannot ring. Signing out lets the page go.
let leaving = false;

export function allowLeaving(): void {
	leaving = true;
}

export function useLeaveGuard(active: boolean): void {
	const computer = useFinePointer();
	useEffect(() => {
		if (!active || !computer) {
			return;
		}
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!leaving) {
				event.preventDefault();
			}
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [active, computer]);
}
