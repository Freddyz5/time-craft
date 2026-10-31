// Time Craft's service worker: shows the api's Web Push messages and opens
// the right page when one is tapped. It caches nothing: the app needs the
// server to be useful.
//
// A push payload is core's PushMessage: { kind, title, body, url, tag, data }.

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
	let message = {};
	try {
		message = event.data ? event.data.json() : {};
	} catch {
		message = { body: event.data ? event.data.text() : "" };
	}
	const title = message.title || "Time Craft";
	const options = {
		body: message.body || "",
		tag: message.tag,
		// A newer message with the same tag replaces the old one, and still
		// sounds: a warning followed by the end must both be noticed.
		renotify: Boolean(message.tag),
		icon: "/icons/icon-192.png",
		badge: "/icons/badge-96.png",
		data: { url: message.url || "/", kind: message.kind },
	};
	event.waitUntil(
		Promise.all([
			self.registration.showNotification(title, options),
			// An open tab refreshes right away instead of waiting for its poll,
			// and one of them rings with this device's sound.
			self.clients
				.matchAll({ type: "window", includeUncontrolled: true })
				.then((windows) => {
					const ringer = pickRinger(windows);
					for (const client of windows) {
						client.postMessage({
							type: "push",
							kind: message.kind,
							title,
							body: options.body,
							tag: message.tag || "",
							data: message.data || {},
							ring: client === ringer,
						});
					}
				}),
		]),
	);
});

// The tab that rings: one of the app's (not the landing or a login page),
// the one in front if there is one. Two tabs ringing at once would only echo.
function pickRinger(windows) {
	const app = windows.filter((client) => {
		const path = new URL(client.url).pathname;
		return (
			/^\/(padres|nino)(\/|$)/.test(path) && !path.startsWith("/nino/entrar")
		);
	});
	return (
		app.find((client) => client.focused) ||
		app.find((client) => client.visibilityState === "visible") ||
		app[0]
	);
}

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const target = new URL(
		event.notification.data?.url || "/",
		self.location.origin,
	);
	event.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((windows) => {
				for (const client of windows) {
					const url = new URL(client.url);
					if (url.pathname.startsWith(target.pathname) && "focus" in client) {
						return client.focus();
					}
				}
				return self.clients.openWindow(target.href);
			}),
	);
});
