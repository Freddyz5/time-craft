// The parents' side of the Android app opens with the fingerprint, so the
// child cannot approve time on a parent's phone. It locks on start and after
// two minutes away; a browser, or a phone without a fingerprint, never locks.
import { Fingerprint } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
	biometricAvailable,
	isNativeApp,
	verifyFingerprint,
} from "../lib/native";
import { signOut } from "../lib/session";
import { StandaloneFrame } from "./StandaloneFrame";
import { Button, LoadingBricks } from "./ui";

const LOCK_KEY = "timecraft:app-lock";
// When the app was last unlocked or left: a reload (a tapped notification
// reloads the page) within this time does not ask again.
const ACTIVE_KEY = "timecraft:app-active-at";
const LOCK_AFTER_MS = 2 * 60_000;

export function appLockEnabled(): boolean {
	try {
		return window.localStorage.getItem(LOCK_KEY) !== "off";
	} catch {
		return true;
	}
}

export function setAppLockEnabled(on: boolean): void {
	try {
		window.localStorage.setItem(LOCK_KEY, on ? "on" : "off");
	} catch {
		// Blocked storage: the lock stays on.
	}
}

function markActive(): void {
	try {
		window.sessionStorage.setItem(ACTIVE_KEY, String(Date.now()));
	} catch {
		// Blocked storage: the next reload asks again.
	}
}

function recentlyActive(): boolean {
	try {
		const at = Number(window.sessionStorage.getItem(ACTIVE_KEY));
		return Number.isFinite(at) && Date.now() - at < LOCK_AFTER_MS;
	} catch {
		return false;
	}
}

export function AppLock({ children }: { children: ReactNode }) {
	// null: still asking the phone whether it has a fingerprint.
	const [locked, setLocked] = useState<boolean | null>(() =>
		isNativeApp() && appLockEnabled() ? null : false,
	);

	const unlock = useCallback(async () => {
		if (await verifyFingerprint("Abre Time Craft con tu huella")) {
			markActive();
			setLocked(false);
		}
	}, []);

	useEffect(() => {
		if (!isNativeApp() || !appLockEnabled()) {
			return;
		}
		void biometricAvailable().then((available) => {
			setLocked(available && !recentlyActive());
		});
		let hiddenAt: number | null = null;
		const onVisibility = () => {
			if (document.visibilityState === "hidden") {
				hiddenAt = Date.now();
				markActive();
			} else if (
				hiddenAt !== null &&
				Date.now() - hiddenAt > LOCK_AFTER_MS &&
				appLockEnabled()
			) {
				setLocked(true);
			}
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, []);

	// Locked: the fingerprint prompt opens by itself.
	useEffect(() => {
		if (locked === true) {
			void unlock();
		}
	}, [locked, unlock]);

	if (locked === null) {
		return (
			<StandaloneFrame>
				<LoadingBricks />
			</StandaloneFrame>
		);
	}
	if (locked) {
		return (
			<StandaloneFrame>
				<h1 className="text-[1.5rem] leading-tight font-bold">
					Time Craft está bloqueado
				</h1>
				<p className="text-ink-soft">
					Usa tu huella para abrir el lado de los padres.
				</p>
				<Button
					variant="primary"
					icon={<Fingerprint className="size-5" aria-hidden="true" />}
					onClick={() => void unlock()}
				>
					Desbloquear con huella
				</Button>
				<Button variant="quiet" onClick={() => void signOut()}>
					Salir
				</Button>
			</StandaloneFrame>
		);
	}
	return <>{children}</>;
}
