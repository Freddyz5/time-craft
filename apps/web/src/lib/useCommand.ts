// Runs a command against the api: busy state, then a toast with the result
// and a refresh of the live views. When the other parent got there first
// (already resolved, the session changed), the refresh shows what happened.
import { useMutation } from "@tanstack/react-query";
import { useToast } from "../components/toast";
import { ApiError } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { useRefreshLive } from "../lib/queries";

const STALE_CODES = new Set([
	"request_already_resolved",
	"request_expired",
	"report_already_reviewed",
	"invalid_session_transition",
	"concurrent_update",
	"session_already_open",
	"session_not_found",
	"request_not_found",
]);

export function useCommand<Input, Output>(
	run: (input: Input) => Promise<Output>,
	options: {
		success?: string | ((output: Output, input: Input) => string);
		onSuccess?: (output: Output, input: Input) => void;
		// Refresh the live views afterwards (default true).
		refresh?: boolean;
	} = {},
) {
	const toast = useToast();
	const refreshLive = useRefreshLive();
	const refresh = options.refresh ?? true;
	return useMutation({
		mutationFn: run,
		onSuccess: async (output, input) => {
			if (refresh) {
				await refreshLive();
			}
			const message =
				typeof options.success === "function"
					? options.success(output, input)
					: options.success;
			if (message) {
				toast.show("success", message);
			}
			options.onSuccess?.(output, input);
		},
		onError: (error) => {
			toast.show("error", errorMessage(error));
			if (error instanceof ApiError && STALE_CODES.has(error.code)) {
				void refreshLive();
			}
		},
	});
}
