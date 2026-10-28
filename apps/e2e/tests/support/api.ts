// The api's JSON, for setting up a test faster than through the screens, and
// for checking what the screens do not show. Only the fields the tests read.
import type { APIRequestContext, APIResponse } from "@playwright/test";

export interface SessionJson {
	id: string;
	activityId: string;
	requestId: string | null;
	overrideId: string | null;
	status: "scheduled" | "running" | "paused" | "finished" | "cancelled";
	scheduledStartAt: string | null;
	startedAt: string | null;
	plannedDurationSeconds: number;
	endedAt: string | null;
	endReason: "completed" | "stopped_early" | "auto_closed" | null;
	consumedSeconds: number | null;
	endedByParentId: string | null;
}

export interface RequestJson {
	id: string;
	status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
	requestedMinutes: number;
	approvedMinutes: number | null;
}

export async function json<T>(response: APIResponse): Promise<T> {
	if (!response.ok()) {
		throw new Error(
			`${response.url()} answered ${response.status()}: ${await response.text()}`,
		);
	}
	return (await response.json()) as T;
}

export async function liveSession(
	request: APIRequestContext,
	childId: string,
): Promise<SessionJson | null> {
	const view = await json<{ live: { session: SessionJson } | null }>(
		await request.get(`/api/children/${childId}/live-session`),
	);
	return view.live?.session ?? null;
}

// A parent closes whatever is open, which also cancels its QStash messages.
export async function closeOpenSession(
	request: APIRequestContext,
	childId: string,
): Promise<void> {
	const session = await liveSession(request, childId);
	if (session !== null) {
		const action = session.status === "scheduled" ? "cancel" : "stop";
		await json(await request.post(`/api/sessions/${session.id}/${action}`));
	}
}

export async function startSession(
	request: APIRequestContext,
	input: {
		childId: string;
		activityId: string;
		minutes: number;
		startAt?: Date;
	},
): Promise<SessionJson> {
	const { session } = await json<{ session: SessionJson }>(
		await request.post("/api/sessions", {
			data: { ...input, startAt: input.startAt?.toISOString() },
		}),
	);
	return session;
}

export async function sessionCommand(
	request: APIRequestContext,
	sessionId: string,
	command: "pause" | "resume" | "stop" | "start" | "cancel",
): Promise<SessionJson> {
	const { session } = await json<{ session: SessionJson }>(
		await request.post(`/api/sessions/${sessionId}/${command}`, {
			...(command === "pause" ? { data: {} } : {}),
		}),
	);
	return session;
}

export function askFor(
	request: APIRequestContext,
	input: {
		activityId: string;
		minutes: number;
		extraTime?: boolean;
		reason?: string;
	},
): Promise<APIResponse> {
	return request.post("/api/requests", {
		data: {
			requestType: input.extraTime ? "extra_time" : "start",
			activityId: input.activityId,
			requestedMinutes: input.minutes,
			reason: input.reason,
		},
	});
}

export async function createRequest(
	request: APIRequestContext,
	input: Parameters<typeof askFor>[1],
): Promise<RequestJson> {
	const created = await json<{ request: RequestJson }>(
		await askFor(request, input),
	);
	return created.request;
}

export function approve(
	request: APIRequestContext,
	requestId: string,
	input: { approvedMinutes: number; startAt?: Date; note?: string },
): Promise<APIResponse> {
	return request.post(`/api/requests/${requestId}/approve`, {
		data: { ...input, startAt: input.startAt?.toISOString() },
	});
}

export async function setPolicy(
	request: APIRequestContext,
	childId: string,
	input: {
		dailyLimitMinutes: number;
		weeklyLimitMinutes: number;
		weeklyBonusCapMinutes?: number;
		warningMinutes?: number;
	},
): Promise<void> {
	await json(
		await request.post(`/api/children/${childId}/policies`, {
			data: { activityId: null, ...input },
		}),
	);
}

// The api's error code, e.g. request_already_pending.
export async function errorCode(response: APIResponse): Promise<string> {
	const body = (await response.json()) as { error?: { code?: string } };
	return body.error?.code ?? "";
}
