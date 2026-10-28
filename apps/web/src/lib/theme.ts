// The theme of this device: "system" follows the phone or computer, "light"
// and "dark" pin one. The choice lives in this browser only (each parent and
// the child pick their own). Base.astro applies it before the first paint;
// this module changes it and, on "system", follows the system as it changes.
import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

// Keep in sync with the inline script in Base.astro.
const STORAGE_KEY = "timecraft:theme";
// The browser bar takes the colour of the top bar (a plate).
const BAR_COLOR = { light: "#ffffff", dark: "#2a2e36" } as const;

const darkQuery = (): MediaQueryList =>
	window.matchMedia("(prefers-color-scheme: dark)");

export function readThemeChoice(): ThemeChoice {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		return stored === "light" || stored === "dark" ? stored : "system";
	} catch {
		return "system";
	}
}

export function applyTheme(choice: ThemeChoice): void {
	const theme =
		choice === "system" ? (darkQuery().matches ? "dark" : "light") : choice;
	document.documentElement.dataset.theme = theme;
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute("content", BAR_COLOR[theme]);
}

export function saveThemeChoice(choice: ThemeChoice): void {
	try {
		if (choice === "system") {
			window.localStorage.removeItem(STORAGE_KEY);
		} else {
			window.localStorage.setItem(STORAGE_KEY, choice);
		}
	} catch {
		// Private mode or blocked storage: the choice lasts until reload.
	}
	applyTheme(choice);
}

// While the choice is "system", repaint when the system switches.
export function followSystemTheme(): () => void {
	const query = darkQuery();
	const onChange = () => {
		if (readThemeChoice() === "system") {
			applyTheme("system");
		}
	};
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
	const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);
	useEffect(() => {
		// Another tab changed it.
		const onStorage = (event: StorageEvent) => {
			if (event.key === STORAGE_KEY) {
				const next = readThemeChoice();
				setChoice(next);
				applyTheme(next);
			}
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);
	return [
		choice,
		(next) => {
			setChoice(next);
			saveThemeChoice(next);
		},
	];
}
