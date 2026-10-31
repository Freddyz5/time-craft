// The voice that reads an alarm out after its sound, with the browser's own
// speech (nothing to download: Chrome has Spanish voices on Android and on a
// computer). Whether it talks and with which voice is chosen per device, with
// the sounds (sounds.ts). The browser lets it talk when it lets the tab ring:
// after a tap, as with the sound.
import { useSyncExternalStore } from "react";
import { isNativeApp, speakNative } from "./native";
import type { Volume } from "./sounds";

// What an alarm says: the same words as its banner.
export interface AlarmWords {
	title: string;
	body?: string;
}

function speech(): SpeechSynthesis | null {
	// The Android app's web view has no voices: the phone speaks instead.
	if (isNativeApp()) {
		return null;
	}
	return typeof window !== "undefined" &&
		"speechSynthesis" in window &&
		typeof SpeechSynthesisUtterance !== "undefined"
		? window.speechSynthesis
		: null;
}

export function canSpeak(): boolean {
	return speech() !== null || isNativeApp();
}

// Latin American Spanish first, then a voice that works without internet.
const LATIN_AMERICA =
	/^es[-_](419|US|MX|EC|CO|PE|VE|CL|AR|UY|PY|BO|CR|PA|GT|HN|SV|NI|DO|PR|CU)$/i;

function rank(voice: SpeechSynthesisVoice): number {
	return (
		(LATIN_AMERICA.test(voice.lang) ? 2 : 0) + (voice.localService ? 1 : 0)
	);
}

const NONE: readonly SpeechSynthesisVoice[] = [];
let voices: readonly SpeechSynthesisVoice[] = NONE;

function spanishVoices(): readonly SpeechSynthesisVoice[] {
	const found = (speech()?.getVoices() ?? [])
		.filter((voice) => /^es([-_]|$)/i.test(voice.lang))
		.sort((a, b) => rank(b) - rank(a));
	return found.length === 0 ? NONE : found;
}

// The device's Spanish voices, best first. Chrome loads them a moment after
// the page opens.
function currentVoices(): readonly SpeechSynthesisVoice[] {
	if (voices.length === 0) {
		voices = spanishVoices();
	}
	return voices;
}

export function useVoices(): readonly SpeechSynthesisVoice[] {
	return useSyncExternalStore(
		(listener) => {
			const synth = speech();
			if (synth === null) {
				return () => undefined;
			}
			const onChange = () => {
				voices = spanishVoices();
				listener();
			};
			synth.addEventListener("voiceschanged", onChange);
			return () => synth.removeEventListener("voiceschanged", onChange);
		},
		currentVoices,
		() => NONE,
	);
}

// A voice's name as the picker shows it. Android names some by their code
// ("es-us-x-sfb-local"): those show the language instead.
export function voiceLabel(voice: SpeechSynthesisVoice): string {
	if (!/^[a-z]{2,3}[-_][a-z]{2,3}([-_]|$)/i.test(voice.name)) {
		return voice.name;
	}
	try {
		const language = new Intl.DisplayNames(["es"], { type: "language" }).of(
			voice.lang.replace("_", "-"),
		);
		if (language !== undefined) {
			return language.charAt(0).toUpperCase() + language.slice(1);
		}
	} catch {
		// An odd code: the name as it is.
	}
	return voice.name;
}

// The picked voice, or the best one if it was not picked or is gone.
function voiceFor(uri: string | null): SpeechSynthesisVoice | null {
	const all = currentVoices();
	return all.find((voice) => voice.voiceURI === uri) ?? all[0] ?? null;
}

const UNITS: Readonly<Record<string, readonly [string, string]>> = {
	min: ["minuto", "minutos"],
	h: ["hora", "horas"],
};

// The words as they are said: "5 min" reads "5 minutos", "1 h" "1 hora".
export function spokenText({ title, body }: AlarmWords): string {
	const text =
		body === undefined || body === ""
			? title
			: `${title}${/[.!?:…]$/.test(title) ? "" : "."} ${body}`;
	return text.replace(
		/(\d+)\s(min|h)\b/g,
		(_, amount: string, unit: string) =>
			`${amount} ${UNITS[unit]?.[amount === "1" ? 0 : 1] ?? unit}`,
	);
}

const LOUDNESS: Record<Volume, number> = { low: 0.5, medium: 0.8, high: 1 };

// Kept so the browser does not drop it before it ends (Chrome may).
let talking: SpeechSynthesisUtterance | null = null;

// Says the words; resolves when the voice is done or fails. A newer alarm
// talks over an older one.
export function speak(
	words: AlarmWords,
	voiceUri: string | null,
	volume: Volume,
): Promise<void> {
	if (isNativeApp()) {
		return speakNative(spokenText(words), volume);
	}
	const synth = speech();
	if (synth === null) {
		return Promise.resolve();
	}
	const text = spokenText(words);
	return new Promise((resolve) => {
		const utterance = new SpeechSynthesisUtterance(text);
		const voice = voiceFor(voiceUri);
		utterance.lang = voice?.lang ?? "es";
		if (voice !== null) {
			utterance.voice = voice;
		}
		utterance.volume = LOUDNESS[volume];
		// Some voices never say they ended: give up after a while.
		const timer = setTimeout(done, 3_000 + text.length * 120);
		function done() {
			clearTimeout(timer);
			if (talking === utterance) {
				talking = null;
			}
			resolve();
		}
		utterance.addEventListener("end", done);
		utterance.addEventListener("error", done);
		if (synth.speaking || synth.pending) {
			synth.cancel();
		}
		talking = utterance;
		synth.speak(utterance);
	});
}

export function stopSpeaking(): void {
	const synth = speech();
	if (synth !== null && (synth.speaking || synth.pending)) {
		synth.cancel();
	}
}
