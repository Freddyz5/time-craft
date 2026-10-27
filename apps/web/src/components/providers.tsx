// What every island needs around it: the query cache, toasts, the service
// worker (for push), the first tap that unlocks the tab's alarm sound and the
// theme following the system's.
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { unlockAudioOnFirstTap } from "../lib/alarm";
import { onPushMessage, registerServiceWorker } from "../lib/push";
import { createQueryClient } from "../lib/queries";
import { followSystemTheme } from "../lib/theme";
import { ToastProvider } from "./toast";

export function AppProviders({ children }: { children: ReactNode }) {
	const [client] = useState(createQueryClient);

	useEffect(() => {
		void registerServiceWorker();
		const stopAudio = unlockAudioOnFirstTap();
		// A push while the tab is open: refresh everything now.
		const stopPush = onPushMessage(() => {
			void client.invalidateQueries();
		});
		const stopTheme = followSystemTheme();
		return () => {
			stopAudio();
			stopPush();
			stopTheme();
		};
	}, [client]);

	return (
		<QueryClientProvider client={client}>
			<ToastProvider>{children}</ToastProvider>
		</QueryClientProvider>
	);
}
