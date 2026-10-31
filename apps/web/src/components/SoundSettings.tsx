// The tab's alarm on this device: a sound for each kind of alarm (it plays
// when picked), a voice that reads the alarm out, how loud, and whether the
// end keeps ringing until someone touches the page. Saved in this browser
// only, like the theme. The parents see it in Cuentas, the child in Avisos,
// each with their own alarms.
import { ChevronDown, Monitor, Play } from "lucide-react";
import { type ReactNode, useId } from "react";
import { type AlarmWords, testSound, testVoice } from "../lib/alarm";
import {
	type AlarmKind,
	SOUND_GROUPS,
	type SoundId,
	type SoundSettings as SoundSettingsValue,
	useSoundSettings,
	type Volume,
} from "../lib/sounds";
import { canSpeak, useVoices, voiceLabel } from "../lib/voice";
import { Button, Callout, inputClass, Segmented, Switch } from "./ui";

export type Audience = "parents" | "child";

const KINDS: Record<Audience, readonly { kind: AlarmKind; label: string }[]> = {
	parents: [
		{ kind: "warning", label: "Quedan pocos minutos" },
		{ kind: "end", label: "Se acabó el tiempo" },
		{ kind: "notice", label: "Solicitudes, tareas y cierres" },
	],
	child: [
		{ kind: "warning", label: "Te quedan pocos minutos" },
		{ kind: "end", label: "Se acabó tu tiempo" },
		{ kind: "ready", label: "Ya puedes empezar" },
		{ kind: "answer", label: "Te dijeron que sí" },
		{ kind: "notice", label: "Otras respuestas" },
	],
};

const COPY: Record<
	Audience,
	{
		title: string;
		intro: string;
		voice: string;
		sample: AlarmWords;
		repeat: string;
		computer: string;
	}
> = {
	parents: {
		title: "Sonido de este dispositivo",
		intro:
			"Con Time Craft abierto, suena al segundo exacto y cuando llega un aviso, además de la notificación. Se guarda solo aquí.",
		voice:
			"Después del sonido, lee el aviso: «Quedan 5 minutos», «Nueva solicitud».",
		sample: {
			title: "Se acabó el tiempo",
			body: "Detén la sesión cuando apague.",
		},
		repeat: "Vuelve a sonar cada 5 segundos, hasta 5 minutos.",
		computer:
			"En una computadora, deja Time Craft abierto en una pestaña: suena aunque quede detrás de otra ventana o de un juego. Instalado como app (el ícono de instalar en la barra de direcciones de Chrome), suena sin tener que tocarlo antes.",
	},
	child: {
		title: "Sonidos",
		intro:
			"Suenan en este dispositivo mientras tengas Time Craft abierto. Toca uno para elegirlo y escucharlo.",
		voice: "Después del sonido, te dice el aviso: «Te quedan 5 minutos».",
		sample: { title: "Se acabó tu tiempo", body: "Guarda y apaga." },
		repeat: "Suena cada 5 segundos para que no se te pase.",
		computer:
			"En la computadora, deja Time Craft abierto en Inicio: suena aunque quede detrás del juego.",
	},
};

const VOLUMES = [
	{ value: "low", label: "Bajo" },
	{ value: "medium", label: "Medio" },
	{ value: "high", label: "Alto" },
] as const satisfies readonly { value: Volume; label: string }[];

// A picker with its «Probar» button beside it.
function PickerRow({
	id,
	label,
	value,
	onChange,
	onTest,
	testLabel,
	canTest,
	children,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	onTest: () => void;
	testLabel: string;
	canTest: boolean;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={id} className="font-semibold">
				{label}
			</label>
			<div className="flex gap-2">
				<div className="relative min-w-0 flex-1">
					<select
						id={id}
						value={value}
						onChange={(event) => onChange(event.target.value)}
						className={`${inputClass} appearance-none pr-10 font-semibold`}
					>
						{children}
					</select>
					<ChevronDown
						className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-ink-soft"
						aria-hidden="true"
					/>
				</div>
				<Button
					icon={<Play className="size-4.5" aria-hidden="true" />}
					disabled={!canTest}
					aria-label={testLabel}
					onClick={onTest}
				>
					Probar
				</Button>
			</div>
		</div>
	);
}

function SoundRow({
	kind,
	label,
	value,
	volume,
	onChange,
}: {
	kind: AlarmKind;
	label: string;
	value: SoundId;
	volume: Volume;
	onChange: (value: SoundId) => void;
}) {
	return (
		<PickerRow
			id={useId()}
			label={label}
			value={value}
			onChange={(next) => {
				onChange(next as SoundId);
				void testSound(next as SoundId, volume, kind);
			}}
			onTest={() => void testSound(value, volume, kind)}
			testLabel={`Probar: ${label}`}
			canTest={value !== "none"}
		>
			{SOUND_GROUPS.map((group) => (
				<optgroup key={group.label} label={group.label}>
					{group.sounds.map((sound) => (
						<option key={sound.value} value={sound.value}>
							{sound.label}
						</option>
					))}
				</optgroup>
			))}
			<option value="none">Sin sonido</option>
		</PickerRow>
	);
}

// After the sound, the alarm's words out loud, with a voice of the device.
function VoiceSetting({
	audience,
	settings,
	setSettings,
}: {
	audience: Audience;
	settings: SoundSettingsValue;
	setSettings: (settings: SoundSettingsValue) => void;
}) {
	const voices = useVoices();
	const switchId = useId();
	const pickerId = useId();
	const copy = COPY[audience];
	const picked = voices.some((voice) => voice.voiceURI === settings.voice)
		? (settings.voice ?? "")
		: "";

	return (
		<div className="flex flex-col gap-4 border-t-[1.5px] border-rule pt-4">
			<Switch
				id={switchId}
				checked={settings.speak}
				onChange={(speak) => {
					setSettings({ ...settings, speak });
					if (speak) {
						void testVoice(copy.sample, settings.voice, settings.volume);
					}
				}}
				label="Decir el aviso en voz alta"
				description={copy.voice}
			/>
			{settings.speak && voices.length > 0 && (
				<PickerRow
					id={pickerId}
					label="Voz"
					value={picked}
					onChange={(uri) => {
						const voice = uri === "" ? null : uri;
						setSettings({ ...settings, voice });
						void testVoice(copy.sample, voice, settings.volume);
					}}
					onTest={() =>
						void testVoice(copy.sample, settings.voice, settings.volume)
					}
					testLabel="Probar la voz"
					canTest
				>
					<option value="">Automática</option>
					{voices.map((voice) => (
						<option key={voice.voiceURI} value={voice.voiceURI}>
							{voiceLabel(voice)}
						</option>
					))}
				</PickerRow>
			)}
		</div>
	);
}

export function SoundSettings({ audience }: { audience: Audience }) {
	const [settings, setSettings] = useSoundSettings();
	const copy = COPY[audience];
	const titleId = useId();
	const repeatId = useId();

	return (
		<Callout
			className="flex flex-col gap-5 p-4 sm:p-5"
			aria-labelledby={titleId}
		>
			<div className="flex flex-col gap-1">
				<h2 id={titleId} className="text-[1.375rem] leading-tight font-bold">
					{copy.title}
				</h2>
				<p className="text-ink-soft">{copy.intro}</p>
			</div>

			<div className="flex flex-col gap-4">
				{KINDS[audience].map(({ kind, label }) => (
					<SoundRow
						key={kind}
						kind={kind}
						label={label}
						value={settings.sounds[kind]}
						volume={settings.volume}
						onChange={(value) =>
							setSettings({
								...settings,
								sounds: { ...settings.sounds, [kind]: value },
							})
						}
					/>
				))}
			</div>

			{canSpeak() && (
				<VoiceSetting
					audience={audience}
					settings={settings}
					setSettings={setSettings}
				/>
			)}

			<div className="flex flex-col gap-1.5">
				<p className="font-semibold" aria-hidden="true">
					Volumen
				</p>
				<Segmented
					value={settings.volume}
					onChange={(volume) => {
						setSettings({ ...settings, volume });
						void testSound(settings.sounds.warning, volume, "warning");
					}}
					options={VOLUMES}
					label="Volumen"
				/>
				<p className="text-[0.9375rem] text-ink-soft">
					También depende del volumen del teléfono o la computadora.
				</p>
			</div>

			<div className="border-t-[1.5px] border-rule pt-4">
				<Switch
					id={repeatId}
					checked={settings.repeatEnd}
					onChange={(repeatEnd) => setSettings({ ...settings, repeatEnd })}
					label="Repetir el fin hasta que toques la pantalla"
					description={copy.repeat}
				/>
			</div>

			<p className="flex items-start gap-2.5 text-[0.9375rem] text-ink-soft">
				<Monitor className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
				{copy.computer}
			</p>
		</Callout>
	);
}
