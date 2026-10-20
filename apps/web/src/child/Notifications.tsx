// Avisos: what this device tells the child even with the app closed (the
// warning, the end, "you can start", the parents' answers), turning that on
// or off here, a sound check for the open tab's own alarm, and signing out of
// a device that is not theirs. Inicio offers it once, quietly, while it is off.
import {
	Bell,
	BellOff,
	Clock,
	LogOut,
	MessageCircle,
	Play,
	TimerOff,
	Volume2,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "../components/toast";
import { Button, Callout, Notice } from "../components/ui";
import { testRing } from "../lib/alarm";
import { ApiError } from "../lib/api";
import { disablePush, enablePush, usePushState } from "../lib/push";
import { usePolicies } from "../lib/queries";
import { signOut } from "../lib/session";
import { useChild } from "./context";
import { childErrorMessage } from "./errors";

const deniedHelp =
	"Este navegador los tiene bloqueados. Pídele a mamá o papá que los permitan: en Chrome, el candado junto a la dirección › Permisos › Notificaciones › Permitir.";

function usePushSwitch() {
	const { state, setState } = usePushState();
	const toast = useToast();
	const [busy, setBusy] = useState(false);
	async function change(on: boolean) {
		setBusy(true);
		try {
			const next = on ? await enablePush() : await disablePush();
			setState(next);
			if (next === "on") {
				toast.show("success", "¡Listo! Te vamos a avisar aquí.");
			} else if (next === "denied") {
				toast.show("error", "El navegador bloqueó los avisos", deniedHelp);
			}
		} catch (error) {
			toast.show(
				"error",
				error instanceof ApiError
					? childErrorMessage(error)
					: "Este navegador no pudo activar los avisos",
				error instanceof ApiError
					? undefined
					: "En una ventana de incógnito no funcionan. Prueba en una ventana normal.",
			);
		} finally {
			setBusy(false);
		}
	}
	return { state, busy, change };
}

const OFFER_DISMISSED = "timecraft:child-push-offer-dismissed";

function offerDismissed(): boolean {
	try {
		return window.localStorage.getItem(OFFER_DISMISSED) === "1";
	} catch {
		return false;
	}
}

// Inicio's card, only while this device has no subscription and nobody said
// "Ahora no" here. Avisos keeps the switch either way.
export function PushOffer() {
	const { state, busy, change } = usePushSwitch();
	const [dismissed, setDismissed] = useState(offerDismissed);
	if (state !== "off" || dismissed) {
		return null;
	}
	return (
		<Callout
			className="flex flex-col gap-3 p-4 sm:p-5"
			aria-labelledby="push-offer"
		>
			<div className="flex items-start gap-3">
				<Bell className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
				<div className="flex flex-col gap-1">
					<h2 id="push-offer" className="text-xl leading-tight font-semibold">
						Activa los avisos
					</h2>
					<p className="text-ink-soft">
						Te avisamos cuando falten unos minutos, cuando se acabe tu tiempo y
						cuando te respondan, aunque la app esté cerrada.
					</p>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					icon={<Bell className="size-5" aria-hidden="true" />}
					busy={busy}
					onClick={() => void change(true)}
				>
					Activar avisos
				</Button>
				<Button
					variant="quiet"
					onClick={() => {
						setDismissed(true);
						try {
							window.localStorage.setItem(OFFER_DISMISSED, "1");
						} catch {
							// Private mode: it hides for this visit only.
						}
					}}
				>
					Ahora no
				</Button>
			</div>
		</Callout>
	);
}

function What({ Icon, children }: { Icon: typeof Bell; children: string }) {
	return (
		<li className="flex items-center gap-3">
			<span
				className="grid size-10 shrink-0 place-items-center rounded-full bg-sheet-sunk"
				aria-hidden="true"
			>
				<Icon className="size-5" />
			</span>
			<span className="text-lg">{children}</span>
		</li>
	);
}

export function Notifications() {
	const { childId } = useChild();
	const policies = usePolicies(childId);
	const { state, busy, change } = usePushSwitch();
	const global =
		policies.data?.policies.find((p) => p.activityId === null) ??
		policies.data?.policies[0];
	const warning = global?.warningMinutes ?? 5;

	return (
		<div className="mx-auto flex max-w-xl flex-col gap-5">
			<div className="flex flex-col gap-1">
				<h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.01em]">
					Avisos
				</h1>
				<p className="text-ink-soft">
					Te avisamos en este dispositivo, aunque la app esté cerrada.
				</p>
			</div>

			<Callout
				className="flex flex-col gap-5 p-4 sm:p-5"
				aria-labelledby="what-title"
			>
				<h2 id="what-title" className="text-xl leading-tight font-semibold">
					Te avisamos cuando…
				</h2>
				<ul className="flex flex-col gap-3">
					{warning > 0 && (
						<What Icon={Clock}>
							{warning === 1 ? "te quede 1 min" : `te queden ${warning} min`}
						</What>
					)}
					<What Icon={TimerOff}>se acabe tu tiempo</What>
					<What Icon={Play}>ya puedas empezar una sesión programada</What>
					<What Icon={MessageCircle}>
						mamá o papá respondan tus pedidos y tareas
					</What>
				</ul>

				{state === null ? null : state === "on" ? (
					<Notice
						tone="success"
						action={
							<Button
								size="sm"
								icon={<BellOff className="size-4" aria-hidden="true" />}
								busy={busy}
								onClick={() => void change(false)}
							>
								Desactivar
							</Button>
						}
					>
						<span className="flex items-center gap-2 font-medium">
							<Bell className="size-5 shrink-0" aria-hidden="true" />
							Avisos activados aquí
						</span>
					</Notice>
				) : state === "denied" ? (
					<Notice>{deniedHelp}</Notice>
				) : state === "unsupported" ? (
					<Notice>
						Este navegador no puede recibir avisos. En un teléfono Android,
						ábrelo en Chrome.
					</Notice>
				) : (
					<Button
						variant="primary"
						block
						className="min-h-14 text-lg"
						icon={<Bell className="size-5" aria-hidden="true" />}
						busy={busy}
						onClick={() => void change(true)}
					>
						Activar avisos
					</Button>
				)}
			</Callout>

			<Callout
				className="flex flex-col items-start gap-3 p-4 sm:p-5"
				aria-labelledby="sound-title"
			>
				<h2 id="sound-title" className="text-xl leading-tight font-semibold">
					Con la app abierta
				</h2>
				<p className="text-ink-soft">
					También suena y vibra justo a tiempo. Prueba cómo suena.
				</p>
				<Button
					icon={<Volume2 className="size-5" aria-hidden="true" />}
					onClick={() => void testRing("warning")}
				>
					Probar el sonido
				</Button>
			</Callout>

			<Callout
				className="flex flex-col items-start gap-3 p-4 sm:p-5"
				aria-labelledby="device-title"
			>
				<h2 id="device-title" className="text-xl leading-tight font-semibold">
					Este dispositivo
				</h2>
				<p className="text-ink-soft">
					¿No es tu teléfono ni tu computadora? Sal, así nadie más ve tu tiempo
					ni pide por ti.
				</p>
				<Button
					variant="quiet"
					className="-mx-3"
					icon={<LogOut className="size-5" aria-hidden="true" />}
					onClick={() => void signOut("/nino/entrar")}
				>
					Salir
				</Button>
			</Callout>
		</div>
	);
}
