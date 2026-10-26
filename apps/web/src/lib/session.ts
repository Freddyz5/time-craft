// Signing out of this browser. Its push subscription goes first: the next
// person to use the browser should not get this person's notifications.
import { authClient } from "./auth";
import { disablePush } from "./push";

// `to`: where to land afterwards (the child goes back to their own login).
export async function signOut(to = "/login"): Promise<void> {
	await disablePush().catch(() => undefined);
	await authClient.signOut().catch(() => undefined);
	window.location.assign(to);
}
