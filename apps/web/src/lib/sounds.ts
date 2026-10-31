// The tab's sounds: a catalogue made with Web Audio (nothing to download),
// from soft chimes to alarms that are hard to miss, and which one this device
// plays for each kind of alarm, how loud, whether the end keeps ringing and
// whether a voice reads the alarm out (voice.ts). Like the theme, the choice
// lives in this browser only: each parent and the child pick their own.
import { useEffect, useState } from "react";
import { syncSoundSettings } from "./native";

export type AlarmKind =
	| "warning" // a few minutes left
	| "end" // the session reached its end
	| "ready" // the child can start a scheduled session
	| "answer" // a parent said yes to the child
	| "notice"; // anything else a push brings: a request, a task, a "no"

// One note. It rises to its level, holds it until `hold` seconds after its
// start (0: it fades at once, like a bell) and fades out over `fade`.
export interface Tone {
	// Seconds from the start of the sound.
	at: number;
	hz: number;
	// Slides in straight lines to these pitches: [seconds after `at`, Hz].
	glide?: readonly (readonly [number, number])[];
	wave: OscillatorType;
	hold: number;
	fade: number;
	// Seconds to reach the level (20 ms unless it is a strike).
	attack?: number;
	// Loudness against the others: a square wave sounds louder than a sine.
	level: number;
}

export type SoundGroup = "soft" | "alarm" | "game";

export interface Sound {
	label: string;
	group: SoundGroup;
	tones: readonly Tone[];
}

// Notes one after another, each struck and fading: the first sounds.
function melody(
	wave: OscillatorType,
	notes: readonly number[],
	{ step, decay, level }: { step: number; decay: number; level: number },
): Tone[] {
	return notes.map((hz, index) => ({
		at: index * step,
		hz,
		wave,
		hold: 0,
		fade: decay,
		level,
	}));
}

// Notes that hold their level, each `length` seconds long.
function held(
	wave: OscillatorType,
	notes: readonly (readonly [at: number, hz: number, length: number])[],
	level: number,
): Tone[] {
	return notes.map(([at, hz, length]) => ({
		at,
		hz,
		wave,
		hold: length,
		fade: 0.04,
		attack: 0.01,
		level,
	}));
}

// Short beeps in groups: `groups` of `count` beeps, like an alarm clock.
function beeps(
	hz: number,
	{
		count,
		groups,
		every,
		gap,
		length,
		level,
	}: {
		count: number;
		groups: number;
		every: number;
		gap: number;
		length: number;
		level: number;
	},
): Tone[] {
	return Array.from({ length: groups }, (_, group) =>
		held(
			"square",
			Array.from({ length: count }, (_, index) => [
				group * (count * every + gap) + index * every,
				hz,
				length,
			]),
			level,
		),
	).flat();
}

// A hammer between two bells: quick metallic strikes for `seconds`.
function bell(
	pitches: readonly [number, number],
	{ every, seconds, level }: { every: number; seconds: number; level: number },
): Tone[] {
	return Array.from({ length: Math.round(seconds / every) }, (_, index) => {
		const hz = pitches[index % 2] ?? pitches[0];
		const at = index * every;
		return [
			{ at, hz, wave: "triangle", hold: 0, fade: 0.5, attack: 0.006, level },
			// The ring of the metal, above the note.
			{
				at,
				hz: hz * 2.76,
				wave: "sine",
				hold: 0,
				fade: 0.2,
				attack: 0.006,
				level: level * 0.4,
			},
		] satisfies Tone[];
	}).flat();
}

// A pitch that slides up and down between two notes, `turns` times.
function sweep(
	from: number,
	to: number,
	{
		turn,
		turns,
		wave,
		level,
	}: {
		turn: number;
		turns: number;
		wave: OscillatorType;
		level: number;
	},
): Tone[] {
	const glide = Array.from(
		{ length: turns },
		(_, index) => [(index + 1) * turn, index % 2 === 0 ? to : from] as const,
	);
	return [
		{
			at: 0,
			hz: from,
			glide,
			wave,
			hold: turns * turn,
			fade: 0.08,
			attack: 0.03,
			level,
		},
	];
}

export const SOUNDS = {
	// Soft: the sounds the tab always had.
	chime: {
		label: "Campanita",
		group: "soft",
		tones: melody("sine", [659.25, 880], { step: 0.28, decay: 0.9, level: 1 }),
	},
	fall: {
		label: "Bajada",
		group: "soft",
		tones: melody("sine", [880, 739.99, 587.33], {
			step: 0.28,
			decay: 0.9,
			level: 1,
		}),
	},
	rise: {
		label: "Subida",
		group: "soft",
		tones: melody("sine", [523.25, 659.25, 783.99], {
			step: 0.28,
			decay: 0.9,
			level: 1,
		}),
	},
	bright: {
		label: "Destello",
		group: "soft",
		tones: melody("sine", [783.99, 1174.66], {
			step: 0.28,
			decay: 0.9,
			level: 1,
		}),
	},
	doorbell: {
		label: "Timbre",
		group: "soft",
		tones: melody("sine", [783.99, 622.25], {
			step: 0.42,
			decay: 1.2,
			level: 1,
		}),
	},
	xylophone: {
		label: "Xilófono",
		group: "soft",
		tones: melody("triangle", [1046.5, 1318.51, 1567.98, 2093], {
			step: 0.11,
			decay: 0.45,
			level: 1.1,
		}),
	},
	trill: {
		label: "Trino",
		group: "soft",
		tones: melody(
			"triangle",
			[1318.51, 1567.98, 1318.51, 1567.98, 1318.51, 1567.98],
			{ step: 0.075, decay: 0.18, level: 1 },
		),
	},
	beeper: {
		label: "Despertador",
		group: "soft",
		tones: melody("square", [1046.5, 1046.5, 1046.5, 1046.5], {
			step: 0.16,
			decay: 0.11,
			level: 0.45,
		}),
	},

	// Alarms: longer, held and full of harmonics, in the range a phone's
	// speaker plays loudest.
	alarm: {
		label: "Alarma",
		group: "alarm",
		tones: beeps(2093, {
			count: 4,
			groups: 3,
			every: 0.12,
			gap: 0.36,
			length: 0.07,
			level: 1.5,
		}),
	},
	clockbell: {
		label: "Despertador de campana",
		group: "alarm",
		tones: bell([1318.51, 1396.91], { every: 0.055, seconds: 2.2, level: 1.1 }),
	},
	schoolbell: {
		label: "Campana de escuela",
		group: "alarm",
		tones: bell([880, 932.33], { every: 0.07, seconds: 2.6, level: 1.1 }),
	},
	siren: {
		label: "Sirena",
		group: "alarm",
		tones: sweep(600, 1350, {
			turn: 0.7,
			turns: 4,
			wave: "square",
			level: 1.4,
		}),
	},
	yelp: {
		label: "Sirena rápida",
		group: "alarm",
		tones: sweep(750, 1500, {
			turn: 0.14,
			turns: 16,
			wave: "square",
			level: 1.4,
		}),
	},
	hilo: {
		label: "Alerta",
		group: "alarm",
		tones: held(
			"square",
			Array.from(
				{ length: 8 },
				(_, index) =>
					[index * 0.3, index % 2 === 0 ? 1046.5 : 783.99, 0.26] as const,
			),
			1.4,
		),
	},
	horn: {
		label: "Bocina",
		group: "alarm",
		tones: [0, 0.62].flatMap((at) =>
			held(
				"sawtooth",
				[
					[at, 349.23, 0.45],
					[at, 440, 0.45],
				],
				1.2,
			),
		),
	},
	longbeeps: {
		label: "Pitidos largos",
		group: "alarm",
		tones: beeps(1174.66, {
			count: 3,
			groups: 1,
			every: 0.7,
			gap: 0,
			length: 0.45,
			level: 1.4,
		}),
	},

	// Game: short tunes in the style of an old console.
	levelup: {
		label: "Nivel superado",
		group: "game",
		tones: [
			...held(
				"square",
				[523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].map(
					(hz, index) => [index * 0.065, hz, 0.05] as const,
				),
				0.9,
			),
			...held("square", [[0.4, 2093, 0.35]], 0.9),
			...held("triangle", [[0.4, 523.25, 0.35]], 0.9),
		],
	},
	gameover: {
		label: "Fin del juego",
		group: "game",
		tones: [
			...held(
				"square",
				[
					[0, 783.99, 0.15],
					[0.18, 659.25, 0.15],
					[0.36, 523.25, 0.15],
				],
				1,
			),
			{
				at: 0.56,
				hz: 392,
				glide: [
					[0.3, 392],
					[0.75, 349.23],
				],
				wave: "square",
				hold: 0.75,
				fade: 0.15,
				attack: 0.01,
				level: 1,
			},
		],
	},
	fanfare: {
		label: "Fanfarria",
		group: "game",
		tones: [
			...held(
				"sawtooth",
				[
					[0, 392, 0.1],
					[0.13, 523.25, 0.1],
					[0.26, 659.25, 0.1],
					[0.39, 783.99, 0.55],
				],
				1.1,
			),
			...held("triangle", [[0.39, 261.63, 0.55]], 0.9),
		],
	},
} satisfies Record<string, Sound>;

export type SoundId = keyof typeof SOUNDS | "none";

// How long a sound lasts, in seconds.
export function soundSeconds(id: SoundId): number {
	if (id === "none") {
		return 0;
	}
	return Math.max(
		...SOUNDS[id].tones.map((tone: Tone) => tone.at + tone.hold + tone.fade),
	);
}

// The picker's list, in groups; "Sin sonido" goes after them.
export const SOUND_GROUPS: readonly {
	label: string;
	sounds: readonly { value: SoundId; label: string }[];
}[] = (
	[
		["soft", "Suaves"],
		["alarm", "Alarmas"],
		["game", "De videojuego"],
	] as const
).map(([group, label]) => ({
	label,
	sounds: (Object.keys(SOUNDS) as (keyof typeof SOUNDS)[])
		.filter((id) => SOUNDS[id].group === group)
		.map((id) => ({ value: id, label: SOUNDS[id].label })),
}));

export type Volume = "low" | "medium" | "high";

export interface SoundSettings {
	sounds: Record<AlarmKind, SoundId>;
	volume: Volume;
	// The end rings again every few seconds until someone touches the page.
	repeatEnd: boolean;
	// After the sound, a voice reads the alarm, with this voice (its URI) or,
	// if null or gone, the best Spanish one the device has.
	speak: boolean;
	voice: string | null;
}

// The sounds the tab always had, but the end: a soft chime was easy to miss.
export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
	sounds: {
		warning: "chime",
		end: "alarm",
		ready: "rise",
		answer: "bright",
		notice: "doorbell",
	},
	volume: "medium",
	repeatEnd: true,
	speak: false,
	voice: null,
};

const STORAGE_KEY = "timecraft:sounds";

function isSoundId(value: unknown): value is SoundId {
	return (
		value === "none" ||
		(typeof value === "string" && Object.hasOwn(SOUNDS, value))
	);
}

// What this browser saved, filled in with the defaults (an older or broken
// value never breaks the alarm).
export function readSoundSettings(): SoundSettings {
	let stored: unknown = null;
	try {
		stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
	} catch {
		// Blocked storage or a broken value: the defaults.
	}
	const defaults = DEFAULT_SOUND_SETTINGS;
	if (typeof stored !== "object" || stored === null) {
		return defaults;
	}
	const saved = stored as Partial<Record<keyof SoundSettings, unknown>>;
	const savedSounds =
		typeof saved.sounds === "object" && saved.sounds !== null
			? (saved.sounds as Partial<Record<AlarmKind, unknown>>)
			: {};
	const sounds = { ...defaults.sounds };
	for (const kind of Object.keys(sounds) as AlarmKind[]) {
		const value = savedSounds[kind];
		if (isSoundId(value)) {
			sounds[kind] = value;
		}
	}
	return {
		sounds,
		volume:
			saved.volume === "low" ||
			saved.volume === "medium" ||
			saved.volume === "high"
				? saved.volume
				: defaults.volume,
		repeatEnd:
			typeof saved.repeatEnd === "boolean"
				? saved.repeatEnd
				: defaults.repeatEnd,
		speak: typeof saved.speak === "boolean" ? saved.speak : defaults.speak,
		voice: typeof saved.voice === "string" ? saved.voice : defaults.voice,
	};
}

export function saveSoundSettings(settings: SoundSettings): void {
	// The Android app's notifications ring with the same choice.
	syncSoundSettings(settings);
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// Private mode or blocked storage: the choice lasts until reload.
	}
}

export function useSoundSettings(): [
	SoundSettings,
	(settings: SoundSettings) => void,
] {
	const [settings, setSettings] = useState(readSoundSettings);
	useEffect(() => {
		// Another tab changed them.
		const onStorage = (event: StorageEvent) => {
			if (event.key === STORAGE_KEY) {
				setSettings(readSoundSettings());
			}
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);
	return [
		settings,
		(next) => {
			setSettings(next);
			saveSoundSettings(next);
		},
	];
}
