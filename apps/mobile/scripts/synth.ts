// Renders the web's sounds (apps/web/src/lib/sounds.ts) to PCM, the way the
// tab plays them with Web Audio (lib/alarm.ts): one oscillator per tone with
// its pitch glides and an exponential attack, hold and fade. Android's
// notification channels need sound files, so the app ships these renders.
import type { Tone } from "../../web/src/lib/sounds";

export const SAMPLE_RATE = 44_100;
// Web Audio's floor for an exponential ramp (lib/alarm.ts).
const FLOOR = 0.0001;

function wave(type: OscillatorType, phase: number): number {
	const p = phase - Math.floor(phase);
	switch (type) {
		case "square":
			return p < 0.5 ? 1 : -1;
		case "sawtooth":
			return 2 * p - 1;
		case "triangle":
			return 1 - 4 * Math.abs(p - 0.5);
		default:
			return Math.sin(2 * Math.PI * p);
	}
}

function exponential(from: number, to: number, progress: number): number {
	return from * (to / from) ** Math.min(1, Math.max(0, progress));
}

// The tone's gain at `t` seconds after it starts, as alarm.ts schedules it.
export function gainAt(tone: Tone, peak: number, t: number): number {
	const attack = tone.attack ?? 0.02;
	const end = tone.hold + tone.fade;
	if (t < 0 || t > end) {
		return 0;
	}
	if (t <= attack) {
		return exponential(FLOOR, peak, t / attack);
	}
	// The fade starts after the hold, or right after the attack if the hold
	// is shorter (a struck note).
	const fadeFrom = tone.hold > attack ? tone.hold : attack;
	if (t <= fadeFrom) {
		return peak;
	}
	return exponential(peak, FLOOR, (t - fadeFrom) / (end - fadeFrom));
}

// The tone's pitch at `t`: linear glides from one point to the next.
export function pitchAt(tone: Tone, t: number): number {
	let hz = tone.hz;
	let from = 0;
	for (const [after, target] of tone.glide ?? []) {
		if (t <= after) {
			return hz + (target - hz) * ((t - from) / (after - from || 1));
		}
		hz = target;
		from = after;
	}
	return hz;
}

// Mixes the tones and normalizes the peak to -1 dBFS: the phone's volume,
// not the file, sets how loud it rings.
export function render(tones: readonly Tone[]): Float32Array {
	const seconds = Math.max(...tones.map((t) => t.at + t.hold + t.fade)) + 0.1;
	const out = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
	for (const tone of tones) {
		const start = Math.round(tone.at * SAMPLE_RATE);
		const length = Math.ceil((tone.hold + tone.fade) * SAMPLE_RATE);
		let phase = 0;
		for (let i = 0; i < length && start + i < out.length; i++) {
			const t = i / SAMPLE_RATE;
			phase += pitchAt(tone, t) / SAMPLE_RATE;
			out[start + i] =
				(out[start + i] ?? 0) +
				wave(tone.wave, phase) * gainAt(tone, tone.level, t);
		}
	}
	let max = 0;
	for (const sample of out) {
		max = Math.max(max, Math.abs(sample));
	}
	const gain = max > 0 ? 0.89 / max : 0;
	for (let i = 0; i < out.length; i++) {
		out[i] = (out[i] ?? 0) * gain;
	}
	return out;
}

// 16-bit mono WAV.
export function wav(samples: Float32Array): Uint8Array {
	const bytes = new Uint8Array(44 + samples.length * 2);
	const view = new DataView(bytes.buffer);
	const text = (offset: number, value: string) => {
		for (let i = 0; i < value.length; i++) {
			view.setUint8(offset + i, value.charCodeAt(i));
		}
	};
	text(0, "RIFF");
	view.setUint32(4, 36 + samples.length * 2, true);
	text(8, "WAVE");
	text(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, SAMPLE_RATE, true);
	view.setUint32(28, SAMPLE_RATE * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	text(36, "data");
	view.setUint32(40, samples.length * 2, true);
	for (let i = 0; i < samples.length; i++) {
		const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
		view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
	}
	return bytes;
}
