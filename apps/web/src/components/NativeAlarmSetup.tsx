// The Android app's checklist under the push switch: what keeps the phone
// from silencing an alarm (battery saving, the lock screen, Do Not Disturb)
// and a test of the end alarm. For parents, also the fingerprint lock. In a
// browser it renders nothing.
import { BellRing, Check } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import {
	biometricAvailable,
	isNativeApp,
	type NativeStatus,
	timeCraft,
} from "../lib/native";
import { appLockEnabled, setAppLockEnabled } from "./AppLock";
import { Button, Switch } from "./ui";

function CheckItem({
	ok,
	children,
	action,
}: {
	ok: boolean;
	children: ReactNode;
	action?: ReactNode;
}) {
	return (
		<li className="flex flex-wrap items-center justify-between gap-2">
			<span className="flex items-start gap-2">
				{ok ? (
					<Check
						className="mt-0.5 size-5 shrink-0 text-balance"
						aria-label="Listo"
					/>
				) : (
					<span
						role="img"
						className="mt-1.5 size-3 shrink-0 rounded-full bg-stop"
						aria-label="Falta"
					/>
				)}
				<span>{children}</span>
			</span>
			{!ok && action}
		</li>
	);
}

export function NativeAlarmSetup({
	audience,
}: {
	audience: "parents" | "child";
}) {
	const lockId = useId();
	const [status, setStatus] = useState<NativeStatus | null>(null);
	const [canLock, setCanLock] = useState(false);
	const [lock, setLock] = useState(appLockEnabled);

	useEffect(() => {
		if (!isNativeApp()) {
			return;
		}
		const read = () => {
			timeCraft
				.getStatus()
				.then(setStatus)
				.catch(() => undefined);
		};
		read();
		void biometricAvailable().then(setCanLock);
		// Back from Android's settings: read again.
		const onVisible = () => {
			if (document.visibilityState === "visible") {
				read();
			}
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => document.removeEventListener("visibilitychange", onVisible);
	}, []);

	// Shown even before Firebase is set up: the test rings locally.
	if (status === null) {
		return null;
	}
	const open = (which: "notifications" | "battery" | "fullScreen") => {
		void timeCraft.openSettings({ which });
	};

	return (
		<div className="flex flex-col gap-3 border-t border-rule pt-3">
			<h3 className="font-bold">Para que la alarma no se silencie</h3>
			<ul className="flex flex-col gap-2">
				<CheckItem
					ok={status.batteryUnrestricted}
					action={
						<Button size="sm" onClick={() => open("battery")}>
							Permitir
						</Button>
					}
				>
					{status.batteryUnrestricted
						? "El ahorro de batería no retrasa las alarmas."
						: "El ahorro de batería puede retrasar las alarmas."}
				</CheckItem>
				<CheckItem
					ok={status.fullScreen}
					action={
						<Button size="sm" onClick={() => open("fullScreen")}>
							Permitir
						</Button>
					}
				>
					{status.fullScreen
						? "El fin de la sesión se muestra sobre la pantalla bloqueada."
						: "El fin de la sesión no puede mostrarse sobre la pantalla bloqueada."}
				</CheckItem>
			</ul>
			<p className="text-[0.9375rem] text-ink-soft">
				El aviso previo y el fin suenan como alarma, aunque el teléfono esté en
				silencio. Si usas No molestar y algún aviso no suena, permítelo en los
				ajustes de avisos de la app.
			</p>
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					icon={<BellRing className="size-4" aria-hidden="true" />}
					onClick={() =>
						void timeCraft.testAlert({
							kind: "end",
							title: "Se acabó el tiempo",
							body: "Así suena el fin de una sesión. Toca Detener para callarla.",
						})
					}
				>
					Probar la alarma de fin
				</Button>
				<Button size="sm" variant="quiet" onClick={() => open("notifications")}>
					Ajustes de avisos
				</Button>
			</div>
			{audience === "parents" && canLock && (
				<Switch
					id={lockId}
					checked={lock}
					onChange={(on) => {
						setLock(on);
						setAppLockEnabled(on);
					}}
					label="Pedir huella al abrir la app"
					description="Así nadie más puede aprobar tiempo desde este teléfono."
				/>
			)}
		</div>
	);
}
