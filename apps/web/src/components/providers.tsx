// What every island needs around it: the query cache, toasts, the service
// worker (for push), the tap that unlocks the tab's alarm sound, the push
// that reaches an open tab and the theme following the system's.
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { alarmForPush, ringOnce, unlockAudioOnTap } from "../lib/alarm";
import { onPushMessage, registerServiceWorker } from "../lib/push";
import { createQueryClient } from "../lib/queries";
import { followSystemTheme } from "../lib/theme";
import { ToastProvider, useToast } from "./toast";

export function AppProviders({ children }: { children: ReactNode }) {
	const [client] = useState(createQueryClient);

	useEffect(() => {
		void registerServiceWorker();
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
				const kind = alarmForPush(push.kind);
				if (!push.ring || kind === null) {
					return;
				}
				const subject =
					push.data.requestId ??
					push.data.reportId ??
					push.data.sessionId ??
					push.tag;
				ringOnce(subject, kind, () => {
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
