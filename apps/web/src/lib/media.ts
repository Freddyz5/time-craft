// Whether the viewport is at least a laptop's width (Tailwind's lg).
import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 64rem)";

function subscribe(listener: () => void) {
	const media = window.matchMedia(QUERY);
	media.addEventListener("change", listener);
	return () => media.removeEventListener("change", listener);
}

export function useIsWide(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(QUERY).matches,
		() => false,
	);
}
