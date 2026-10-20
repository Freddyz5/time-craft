// What every island needs around it: the query cache, toasts, the service
// worker (for push) and the first tap that unlocks the tab's alarm sound.
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { unlockAudioOnFirstTap } from "../lib/alarm";
import { onPushMessage, registerServiceWorker } from "../lib/push";
import { createQueryClient } from "../lib/queries";
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
		return () => {
			stopAudio();
			stopPush();
		};
	}, [client]);

	return (
		<QueryClientProvider client={client}>
			<ToastProvider>{children}</ToastProvider>
		</QueryClientProvider>
	);
}
