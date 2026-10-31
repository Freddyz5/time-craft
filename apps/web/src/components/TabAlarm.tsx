// Under "Ahora" while an alarm is due (a session running or scheduled):
// whether this tab can ring. Until the first tap the browser keeps it quiet,
// so the plate offers the tap. On a computer, where a tab left open rings
// even behind a game, it says to leave it open, and closing it asks first.
// A phone with the sound on needs no plate: the notification covers the
// rest.
import { Volume2, VolumeX } from "lucide-react";
import { useId } from "react";
import {
	testSound,
	useFinePointer,
	useLeaveGuard,
	useSoundState,
} from "../lib/alarm";
import { readSoundSettings } from "../lib/sounds";
import type { Audience } from "./SoundSettings";
import { Button, Callout } from "./ui";

const COPY: Record<
	Audience,
	{ locked: string; open: string; openTitle: string }
> = {
	parents: {
		locked:
			"El navegador no deja sonar una pestaña hasta que la tocas. Actívalo para que suene al aviso y al fin.",
		openTitle: "La alarma suena en esta pestaña",
		open: "Déjala abierta en Inicio hasta que termine la sesión, aunque quede detrás de otras ventanas. Si la cierras, aquí no suena.",
	},
	child: {
		locked: "Actívalo para que suene cuando falte poco y cuando se acabe.",
		openTitle: "La alarma suena aquí",
		open: "Deja esta pestaña abierta en Inicio, aunque quede detrás del juego o de otra ventana. Si la cierras, aquí no va a sonar.",
	},
};

export function TabAlarm({ audience }: { audience: Audience }) {
	const sound = useSoundState();
	const computer = useFinePointer();
	const titleId = useId();
	useLeaveGuard(true);
	const copy = COPY[audience];

	if (sound === "unsupported" || (sound === "ready" && !computer)) {
		return null;
	}
	const locked = sound === "locked";
	const Icon = locked ? VolumeX : Volume2;

	return (
		<Callout
			className="flex flex-col gap-3 p-4 sm:p-5"
			aria-labelledby={titleId}
		>
			<div className="flex items-start gap-3">
				<span
					className="grid size-10 shrink-0 place-items-center rounded-full bg-sheet-sunk"
					aria-hidden="true"
				>
					<Icon className="size-5" />
				</span>
				<div className="flex min-w-0 flex-col gap-0.5">
					<h2 id={titleId} className="text-[1.25rem] leading-tight font-bold">
						{locked ? "La alarma está sin sonido" : copy.openTitle}
					</h2>
					<p className="text-ink-soft">{locked ? copy.locked : copy.open}</p>
				</div>
			</div>
			{locked && (
				<Button
					variant="primary"
					className="sm:w-fit"
					icon={<Volume2 className="size-5" aria-hidden="true" />}
					onClick={() => {
						const { sounds, volume } = readSoundSettings();
						void testSound(sounds.warning, volume, "warning");
					}}
				>
					Activar sonido
				</Button>
			)}
		</Callout>
	);
}
