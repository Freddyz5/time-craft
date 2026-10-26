// Turning Web Push on for this browser. Inicio offers it once, quietly, while
// it is off; Cuentas always shows its state.
import { Bell, BellOff } from "lucide-react";
import { useState } from "react";
import { useToast } from "../components/toast";
import { Button, Callout } from "../components/ui";
import { ApiError } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { disablePush, enablePush, usePushState } from "../lib/push";

const deniedHelp =
	"Están bloqueados para este sitio. En Chrome: toca el candado junto a la dirección › Permisos › Notificaciones › Permitir, y vuelve aquí.";

export function PushToggle({ compact = false }: { compact?: boolean }) {
	const { state, setState } = usePushState();
	const toast = useToast();
	const [busy, setBusy] = useState(false);

	async function change(on: boolean) {
		setBusy(true);
		try {
			const next = on ? await enablePush() : await disablePush();
			setState(next);
			if (next === "on") {
				toast.show("success", "Avisos activados en este dispositivo");
			} else if (next === "denied") {
				toast.show("error", "El navegador bloqueó los avisos", deniedHelp);
			}
		} catch (error) {
			// The api answered with an error, or the browser refused to
			// subscribe (an incognito window, a blocked push service).
			toast.show(
				"error",
				error instanceof ApiError
					? errorMessage(error)
					: "Este navegador no pudo activar los avisos",
				error instanceof ApiError
					? undefined
					: "En una ventana de incógnito no funcionan. Prueba en una ventana normal de Chrome.",
			);
		} finally {
			setBusy(false);
		}
	}

	if (state === null) {
		return null;
	}
	if (state === "unsupported") {
		return compact ? null : (
			<p className="text-ink-soft">
				Este navegador no puede recibir avisos. En Android, ábrelo en Chrome.
			</p>
		);
	}
	if (state === "denied") {
		return <p className="text-ink-soft">{deniedHelp}</p>;
	}
	return state === "on" ? (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<p className="flex items-center gap-2">
				<Bell className="size-5 text-balance" aria-hidden="true" />
				Avisos activados aquí.
			</p>
			<Button
				size="sm"
				icon={<BellOff className="size-4" aria-hidden="true" />}
				busy={busy}
				onClick={() => void change(false)}
			>
				Desactivar
			</Button>
		</div>
	) : (
		<Button
			variant={compact ? "secondary" : "primary"}
			icon={<Bell className="size-5" aria-hidden="true" />}
			busy={busy}
			onClick={() => void change(true)}
		>
			Activar avisos
		</Button>
	);
}

const OFFER_DISMISSED = "timecraft:push-offer-dismissed";

function offerDismissed(): boolean {
	try {
		return window.localStorage.getItem(OFFER_DISMISSED) === "1";
	} catch {
		return false;
	}
}

// Inicio's offer, only while this device has no subscription and nobody said
// "Ahora no" here. Cuentas keeps the switch either way.
export function PushOffer() {
	const { state } = usePushState();
	const [dismissed, setDismissed] = useState(offerDismissed);
	if (state !== "off" || dismissed) {
		return null;
	}
	return (
		<Callout
			className="flex flex-col gap-3 p-4 sm:p-5"
			aria-labelledby="push-offer"
		>
			<div className="flex flex-col gap-1">
				<h2 id="push-offer" className="text-xl leading-tight font-semibold">
					Avisos en este dispositivo
				</h2>
				<p className="text-ink-soft">
					Te avisamos cuando pida tiempo, cuando falten unos minutos y cuando se
					acabe una sesión, aunque la app esté cerrada.
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<PushToggle compact />
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
			<p className="text-[0.9375rem] text-ink-soft">
				Puedes activarlos cuando quieras desde Cuentas.
			</p>
		</Callout>
	);
}
