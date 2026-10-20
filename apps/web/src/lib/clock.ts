// The server's clock as seen from this device. Every timer response carries
// serverTime; the offset between it and the local clock lets a phone with the
// wrong time show the same remaining time as everyone else.
import { useEffect, useState, useSyncExternalStore } from "react";

interface Sample {
	offsetMs: number;
	roundTripMs: number;
}

// The last few samples; the one with the shortest round trip is the most
// accurate (the server's instant sits closest to the midpoint).
const MAX_SAMPLES = 5;
let samples: Sample[] = [];
let offsetMs = 0;
const listeners = new Set<() => void>();

export function noteServerTime(
	serverTime: string,
	sentAt: number,
	receivedAt: number,
): void {
	const server = Date.parse(serverTime);
	if (Number.isNaN(server)) {
		return;
	}
	const roundTripMs = Math.max(0, receivedAt - sentAt);
	samples = [
		...samples.slice(-(MAX_SAMPLES - 1)),
		{ offsetMs: server - (sentAt + roundTripMs / 2), roundTripMs },
	];
	const best = samples.reduce((a, b) =>
		b.roundTripMs < a.roundTripMs ? b : a,
	);
	if (best.offsetMs !== offsetMs) {
		offsetMs = best.offsetMs;
		for (const listener of listeners) {
			listener();
		}
	}
}

export function serverNow(): number {
	return Date.now() + offsetMs;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

// The server's "now", ticking every `intervalMs` while mounted.
export function useServerNow(intervalMs = 1000): number {
	const offset = useSyncExternalStore(
		subscribe,
		() => offsetMs,
		() => 0,
	);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		// Tick on the server's whole seconds, so a countdown flips at the same
		// moment on every device.
		const untilNextTick = () => intervalMs - (serverNow() % intervalMs);
		let timer: ReturnType<typeof setTimeout>;
		const tick = () => {
			setNow(Date.now());
			timer = setTimeout(tick, untilNextTick());
		};
		timer = setTimeout(tick, untilNextTick());
		return () => clearTimeout(timer);
	}, [intervalMs]);
	return now + offset;
}
