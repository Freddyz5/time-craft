// The open tab's own alarm: a chime and a vibration at the exact second of
// the warning and of the end. It complements push, which Android may delay;
// it does not replace it, since background tabs freeze their timers.
import { useEffect, useRef } from "react";
import { serverNow } from "./clock";

export type AlarmKind = "warning" | "end";

let audio: AudioContext | null = null;

// Browsers only let a page make sound after a tap: the first tap anywhere
// unlocks it for the rest of the visit.
export function unlockAudioOnFirstTap(): () => void {
	const unlock = () => {
		try {
			audio ??= new AudioContext();
			void audio.resume();
		} catch {
			// No Web Audio: the vibration and the banner still work.
		}
	};
	window.addEventListener("pointerdown", unlock, { once: true });
	window.addEventListener("keydown", unlock, { once: true });
	return () => {
		window.removeEventListener("pointerdown", unlock);
		window.removeEventListener("keydown", unlock);
	};
}

// Soft bell-like notes: two rising for the warning, three falling for the end.
const NOTES: Record<AlarmKind, number[]> = {
	warning: [659.25, 880],
	end: [880, 739.99, 587.33],
};

function chime(kind: AlarmKind): void {
	if (audio === null || audio.state !== "running") {
		return;
	}
	const start = audio.currentTime + 0.05;
	NOTES[kind].forEach((frequency, index) => {
		if (audio === null) {
			return;
		}
		const at = start + index * 0.28;
		const oscillator = audio.createOscillator();
		const gain = audio.createGain();
		oscillator.type = "sine";
		oscillator.frequency.value = frequency;
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
		oscillator.connect(gain).connect(audio.destination);
		oscillator.start(at);
		oscillator.stop(at + 1);
	});
}

const VIBRATION: Record<AlarmKind, number[]> = {
	warning: [180, 120, 180],
	end: [400, 150, 400, 150, 400],
};

export function ring(kind: AlarmKind): void {
	chime(kind);
	try {
		navigator.vibrate?.(VIBRATION[kind]);
	} catch {
		// Not allowed before a tap, or not available.
	}
}

// Alarms already rung, so a refetch or a remount does not ring them twice.
// The key includes the planned end: after a pause the end moves and the
// alarms are due again, as the server reschedules its own.
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

export function useSessionAlarm(
	plan: AlarmPlan | null,
	onRing: (kind: AlarmKind) => void,
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
			const fire = () => {
				if (rung.has(key)) {
					return;
				}
				rung.add(key);
				ring(kind);
				onRingRef.current(kind);
			};
			const delay = at - serverNow();
			if (delay < -GRACE_MS) {
				// Long past (the page opened later): the push already said it.
				rung.add(key);
				return null;
			}
			return setTimeout(fire, Math.max(0, delay));
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
