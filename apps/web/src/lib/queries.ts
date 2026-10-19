// Reads from the api with TanStack Query. Live views poll every few seconds
// (pauses and approvals by the other parent show up on their own); a push
// arriving while the tab is open refreshes them at once (see push.ts).
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, call } from "./api";

// Polling only runs while the tab is visible, so a phone in a pocket never
// keeps the database awake.
export const LIVE_POLL_MS = 5_000;

export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 2_000,
				refetchOnWindowFocus: true,
				retry: (count, error) =>
					!(
						error instanceof ApiError &&
						error.status > 0 &&
						error.status < 500
					) && count < 2,
			},
			mutations: { retry: false },
		},
	});
}

export const keys = {
	me: ["me"] as const,
	balance: (childId: string) => ["balance", childId] as const,
	live: (childId: string) => ["live", childId] as const,
	requests: ["requests"] as const,
	reports: ["reports"] as const,
	policies: (childId: string) => ["policies", childId] as const,
	policyHistory: (childId: string) => ["policy-history", childId] as const,
	bonusTasks: ["bonus-tasks"] as const,
	history: (childId: string, from?: string, to?: string) =>
		["history", childId, from ?? "current", to ?? "current"] as const,
	logins: (childId: string) => ["logins", childId] as const,
};

export function useHousehold() {
	return useQuery({
		queryKey: keys.me,
		queryFn: () => call(api.me.$get()),
		staleTime: 60_000,
	});
}

export function useBalance(childId: string | undefined) {
	return useQuery({
		queryKey: keys.balance(childId ?? ""),
		queryFn: () =>
			call(
				api.children[":childId"].balance.$get({
					param: { childId: childId ?? "" },
				}),
			),
		enabled: childId !== undefined,
		refetchInterval: LIVE_POLL_MS,
	});
}

export function useLiveSession(childId: string | undefined) {
	return useQuery({
		queryKey: keys.live(childId ?? ""),
		queryFn: () =>
			call(
				api.children[":childId"]["live-session"].$get({
					param: { childId: childId ?? "" },
				}),
			),
		enabled: childId !== undefined,
		refetchInterval: LIVE_POLL_MS,
	});
}

export function usePendingRequests() {
	return useQuery({
		queryKey: keys.requests,
		queryFn: () => call(api.requests.$get()),
		refetchInterval: LIVE_POLL_MS,
	});
}

export function usePendingReports() {
	return useQuery({
		queryKey: keys.reports,
		queryFn: () => call(api["task-reports"].$get()),
		refetchInterval: LIVE_POLL_MS,
	});
}

export function usePolicies(childId: string | undefined) {
	return useQuery({
		queryKey: keys.policies(childId ?? ""),
		queryFn: () =>
			call(
				api.children[":childId"].policies.$get({
					param: { childId: childId ?? "" },
				}),
			),
		enabled: childId !== undefined,
	});
}

export function usePolicyHistory(childId: string | undefined) {
	return useQuery({
		queryKey: keys.policyHistory(childId ?? ""),
		queryFn: () =>
			call(
				api.children[":childId"].policies.history.$get({
					param: { childId: childId ?? "" },
				}),
			),
		enabled: childId !== undefined,
	});
}

export function useBonusTasks() {
	return useQuery({
		queryKey: keys.bonusTasks,
		queryFn: () => call(api["bonus-tasks"].$get()),
	});
}

export function useHistory(
	childId: string | undefined,
	period?: { from: string; to: string },
) {
	return useQuery({
		queryKey: keys.history(childId ?? "", period?.from, period?.to),
		queryFn: () =>
			call(
				api.children[":childId"].history.$get({
					param: { childId: childId ?? "" },
					query: period ?? {},
				}),
			),
		enabled: childId !== undefined,
		placeholderData: (previous) => previous,
	});
}

export function useChildLogins(childId: string | undefined) {
	return useQuery({
		queryKey: keys.logins(childId ?? ""),
		queryFn: () =>
			call(
				api.children[":childId"].logins.$get({
					param: { childId: childId ?? "" },
				}),
			),
		enabled: childId !== undefined,
	});
}

// After any command that touches the timer or the balance: refresh what the
// parents' screens show, so the result appears without waiting for a poll.
export function useRefreshLive() {
	const client = useQueryClient();
	return () =>
		Promise.all(
			[["live"], ["balance"], ["requests"], ["reports"], ["history"]].map(
				(queryKey) => client.invalidateQueries({ queryKey }),
			),
		);
}
