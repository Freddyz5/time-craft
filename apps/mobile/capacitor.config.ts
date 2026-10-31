// Capacitor's config for the Android app. The app is a shell around the
// deployed web (server.url): it runs on the web's own origin, so the session
// cookie and /api/* work as they do in the browser, and every web release
// reaches the app without a new APK.
//
// TIMECRAFT_WEB_URL picks the web: production for the release APK, dev's
// domain or a local server (http://10.0.2.2:4321 from the emulator) for
// testing. `cap sync` copies the result into the Android project.
import type { CapacitorConfig } from "@capacitor/cli";

const webUrl = process.env.TIMECRAFT_WEB_URL?.trim() ?? "";
if (!URL.canParse(webUrl)) {
	throw new Error(
		"Set TIMECRAFT_WEB_URL to the web's origin, like https://time-craft.example.com (apps/mobile/CLAUDE.md)",
	);
}
const origin = new URL(webUrl).origin;

const config: CapacitorConfig = {
	appId: "app.timecraft",
	appName: "Time Craft",
	// Only shown when the web cannot load (no connection).
	webDir: "www",
	server: {
		url: origin,
		// Plain http only for a local server while testing.
		cleartext: origin.startsWith("http://"),
		errorPath: "offline.html",
	},
	plugins: {
		SocialLogin: {
			providers: {
				google: true,
				facebook: false,
				apple: false,
				twitter: false,
			},
		},
	},
};

export default config;
