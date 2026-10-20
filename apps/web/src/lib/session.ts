// Signing out of this browser. Its push subscription goes first: the next
// person to use the browser should not get this parent's notifications.
import { authClient } from "./auth";
import { disablePush } from "./push";

export async function signOut(): Promise<void> {
	await disablePush().catch(() => undefined);
	await authClient.signOut().catch(() => undefined);
	window.location.assign("/login");
}
