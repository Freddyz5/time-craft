// Signing out of this browser.
import { authClient } from "./auth";

export async function signOut(): Promise<void> {
	await authClient.signOut().catch(() => undefined);
	window.location.assign("/login");
}
