// What every island needs around it: the query cache, toasts, the service
// worker (for push), the tap that unlocks the tab's alarm sound, the push
// that reaches an open tab and the theme following the system's.
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import {
	alarmForPush,
	ringOnce,
	stopRingingFromPush,
	unlockAudioOnTap,
} from "../lib/alarm";
import { onNativePush, syncSoundSettings } from "../lib/native";
import {
	onPushMessage,
	refreshNativeToken,
	registerServiceWorker,
} from "../lib/push";
import { createQueryClient } from "../lib/queries";
import { readSoundSettings } from "../lib/sounds";
import { followSystemTheme } from "../lib/theme";
import { ToastProvider, useToast } from "./toast";

export function AppProviders({ children }: { children: ReactNode }) {
	const [client] = useState(createQueryClient);

	useEffect(() => {
		void registerServiceWorker();
		// The Android app: its channels follow this phone's sounds, and its
		// push token may have changed since it was registered.
		syncSoundSettings(readSoundSettings());
		void refreshNativeToken().catch(() => undefined);
		const stopAudio = unlockAudioOnTap();
		const stopTheme = followSystemTheme();
		return () => {
			stopAudio();
			stopTheme();
		};
	}, []);

	return (
		<QueryClientProvider client={client}>
			<ToastProvider>
				<PushAlarm />
				<NativePushNotice />
				{children}
			</ToastProvider>
		</QueryClientProvider>
	);
}

// A push while the tab is open: refresh everything now and, in the one tab
// the service worker picked, ring this device's sound and show (and, if this
// device talks, say) the push's own words, unless the tab's timer already
// rang for it. Hidden, the toast waits to be read.
function PushAlarm() {
	const client = useQueryClient();
	const toast = useToast();
	useEffect(
		() =>
			onPushMessage((push) => {
				void client.invalidateQueries();
				if (push.kind === "alarm_stopped") {
					stopRingingFromPush(push.tag);
					return;
				}
				const kind = alarmForPush(push.kind);
				if (!push.ring || kind === null) {
					return;
				}
				ringOnce(push.tag, kind, () => {
					toast.show(
						kind === "notice" || kind === "answer" ? "notice" : "alarm",
						push.title,
						push.body,
						{ sticky: document.visibilityState === "hidden" },
					);
					return { title: push.title, body: push.body };
				});
			}),
		[client, toast],
	);
	return null;
}

// In the Android app, a push reaches the web from the app's own messaging
// service, which already rang it: refresh now and show its words, unless the
// page's own timer already did (ringOnce; the phone ignores the repeat too).
// A tap on the page then stops the phone's alarm, as in a tab.
function NativePushNotice() {
	const client = useQueryClient();
	const toast = useToast();
	useEffect(
		() =>
			onNativePush((push) => {
				void client.invalidateQueries();
				const kind = alarmForPush(push.kind);
				if (kind === null) {
					return;
				}
				ringOnce(push.tag, kind, () => {
					toast.show(
						kind === "notice" || kind === "answer" ? "notice" : "alarm",
						push.title,
						push.body,
					);
					return { title: push.title, body: push.body };
				});
			}),
		[client, toast],
	);
	return null;
}
