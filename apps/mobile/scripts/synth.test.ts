import { describe, expect, test } from "bun:test";
import type { Tone } from "../../web/src/lib/sounds";
import { SOUNDS } from "../../web/src/lib/sounds";
import { gainAt, pitchAt, render, SAMPLE_RATE, wav } from "./synth";

const struck: Tone = {
	at: 0,
	hz: 440,
	wave: "sine",
	hold: 0,
	fade: 0.5,
	level: 1,
};
const held: Tone = {
	at: 0,
	hz: 440,
	wave: "square",
	hold: 0.3,
	fade: 0.04,
	attack: 0.01,
	level: 1,
};

describe("synth", () => {
	test("a struck note peaks after its attack and fades out", () => {
		expect(gainAt(struck, 1, 0.02)).toBeCloseTo(1, 5);
		expect(gainAt(struck, 1, 0.3)).toBeLessThan(0.1);
		expect(gainAt(struck, 1, 0.6)).toBe(0);
	});

	test("a held note keeps its level until the hold ends", () => {
		expect(gainAt(held, 1, 0.2)).toBe(1);
		expect(gainAt(held, 1, 0.33)).toBeLessThan(0.1);
	});

	test("glides move the pitch in straight lines", () => {
		const glide: Tone = { ...struck, glide: [[1, 880]] };
		expect(pitchAt(glide, 0.5)).toBeCloseTo(660);
		expect(pitchAt(glide, 2)).toBe(880);
	});

	test("every catalogue sound renders to a loud, unclipped WAV", () => {
		for (const sound of Object.values(SOUNDS)) {
			const samples = render(sound.tones);
			const peak = Math.max(...samples.map(Math.abs));
			expect(peak).toBeCloseTo(0.89, 2);
			const file = wav(samples);
			expect(new TextDecoder().decode(file.slice(0, 4))).toBe("RIFF");
			expect(file.length).toBe(44 + samples.length * 2);
		}
		expect(SAMPLE_RATE).toBe(44_100);
	});
});
