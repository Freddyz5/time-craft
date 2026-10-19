// What every island needs around it: the query cache and toasts.
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { createQueryClient } from "../lib/queries";
import { ToastProvider } from "./toast";

export function AppProviders({ children }: { children: ReactNode }) {
	const [client] = useState(createQueryClient);

	return (
		<QueryClientProvider client={client}>
			<ToastProvider>{children}</ToastProvider>
		</QueryClientProvider>
	);
}
