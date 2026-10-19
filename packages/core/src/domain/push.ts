// Web Push subscriptions (one per browser and person) and the messages sent
// to them. Message texts are UI, so they are in Spanish.
import { type CalendarSettings, formatTime } from "./calendar";
import type { RequestType } from "./request";

export interface PushSubscription {
	id: string;
	authUserId: string;
	endpoint: string;
	p256dhKey: string;
	authKey: string;
	deviceLabel: string | null;
	createdAt: Date;
	lastUsedAt: Date | null;
}

export type NotificationKind =
	| "session_ready"
	| "session_warning"
	| "session_ended"
	| "session_auto_closed"
	| "session_cancelled_no_time"
	| "request_created"
	| "request_approved"
	| "request_rejected"
	| "report_created"
	| "report_approved"
	| "report_rejected";

export interface PushMessage {
	kind: NotificationKind;
	title: string;
	body: string;
	// Page the notification opens.
	url: string;
	// A newer notification with the same tag replaces the older one.
	tag: string;
	data: Readonly<Record<string, string>>;
}

const PARENTS_URL = "/padres";
const CHILD_URL = "/nino";

// Who reads a message that goes to both parents and child.
export type Audience = "parents" | "child";

function urlFor(audience: Audience): string {
	return audience === "parents" ? PARENTS_URL : CHILD_URL;
}

function withNote(text: string, note: string | null): string {
	return note === null ? text : `${text} «${note}»`;
}

export const messages = {
	// Sessions

	sessionReady(input: {
		sessionId: string;
		activityName: string;
		minutes: number;
	}): PushMessage {
		return {
			kind: "session_ready",
			title: "¡Ya puedes empezar!",
			body: `Tienes ${input.minutes} min de ${input.activityName}.`,
			url: CHILD_URL,
			tag: `session-${input.sessionId}`,
			data: { sessionId: input.sessionId },
		};
	},

	sessionWarning(input: {
		audience: Audience;
		sessionId: string;
		childName: string;
		activityName: string;
		minutesLeft: number;
	}): PushMessage {
		return {
			kind: "session_warning",
			title: `Quedan ${input.minutesLeft} min`,
			body: `${input.activityName} de ${input.childName} está por terminar.`,
			url: urlFor(input.audience),
			tag: `session-${input.sessionId}`,
			data: { sessionId: input.sessionId },
		};
	},

	sessionEnded(input: {
		audience: Audience;
		sessionId: string;
		childName: string;
		activityName: string;
	}): PushMessage {
		return {
			kind: "session_ended",
			title: "Se acabó el tiempo",
			body: `Terminó ${input.activityName} de ${input.childName}.`,
			url: urlFor(input.audience),
			tag: `session-${input.sessionId}`,
			data: { sessionId: input.sessionId },
		};
	},

	sessionAutoClosed(input: {
		sessionId: string;
		childName: string;
		activityName: string;
		consumedMinutes: number;
	}): PushMessage {
		return {
			kind: "session_auto_closed",
			title: "Sesión cerrada automáticamente",
			body: `Nadie detuvo ${input.activityName} de ${input.childName}. Se cerró y contó ${input.consumedMinutes} min.`,
			url: PARENTS_URL,
			tag: `session-${input.sessionId}`,
			data: { sessionId: input.sessionId },
		};
	},

	sessionCancelledNoTime(input: {
		audience: Audience;
		sessionId: string;
		childName: string;
		activityName: string;
	}): PushMessage {
		return {
			kind: "session_cancelled_no_time",
			title: "Sesión cancelada",
			body: `${input.activityName} de ${input.childName} no empezó: ya no quedaba tiempo disponible.`,
			url: urlFor(input.audience),
			tag: `session-${input.sessionId}`,
			data: { sessionId: input.sessionId },
		};
	},

	// Requests

	requestCreated(input: {
		childName: string;
		activityName: string;
		requestId: string;
		requestType: RequestType;
		minutes: number;
		reason: string | null;
	}): PushMessage {
		const body =
			input.requestType === "extra_time"
				? withNote(
						`${input.childName} pide ${input.minutes} min extra de ${input.activityName}:`,
						input.reason,
					)
				: `${input.childName} pide ${input.minutes} min de ${input.activityName}`;
		return {
			kind: "request_created",
			title: "Nueva solicitud",
			body,
			url: PARENTS_URL,
			tag: `request-${input.requestId}`,
			data: { requestId: input.requestId },
		};
	},

	requestApproved(input: {
		requestId: string;
		sessionId: string;
		activityName: string;
		minutes: number;
		scheduledStartAt: Date | null;
		calendar: CalendarSettings;
		note: string | null;
	}): PushMessage {
		const when =
			input.scheduledStartAt === null
				? "¡Ya puedes empezar!"
				: `Empieza a las ${formatTime(input.scheduledStartAt, input.calendar)}.`;
		return {
			kind: "request_approved",
			title: "¡Solicitud aprobada!",
			body: withNote(
				`${input.minutes} min de ${input.activityName}. ${when}`,
				input.note,
			),
			url: CHILD_URL,
			tag: `request-${input.requestId}`,
			data: { requestId: input.requestId, sessionId: input.sessionId },
		};
	},

	requestRejected(input: {
		requestId: string;
		note: string | null;
	}): PushMessage {
		return {
			kind: "request_rejected",
			title: "Solicitud rechazada",
			body: input.note ?? "Esta vez no se pudo.",
			url: CHILD_URL,
			tag: `request-${input.requestId}`,
			data: { requestId: input.requestId },
		};
	},

	// Bonus reports

	reportCreated(input: {
		childName: string;
		taskName: string;
		reportId: string;
		note: string | null;
	}): PushMessage {
		return {
			kind: "report_created",
			title: "Tarea reportada",
			body: withNote(
				`${input.childName} dice que hizo «${input.taskName}».`,
				input.note,
			),
			url: PARENTS_URL,
			tag: `report-${input.reportId}`,
			data: { reportId: input.reportId },
		};
	},

	reportApproved(input: {
		reportId: string;
		taskName: string;
		minutes: number;
	}): PushMessage {
		return {
			kind: "report_approved",
			title: "¡Bono aprobado!",
			body: `Ganaste ${input.minutes} min por «${input.taskName}».`,
			url: CHILD_URL,
			tag: `report-${input.reportId}`,
			data: { reportId: input.reportId },
		};
	},

	reportRejected(input: {
		reportId: string;
		taskName: string;
		note: string | null;
	}): PushMessage {
		return {
			kind: "report_rejected",
			title: "Bono no aprobado",
			body: input.note ?? `«${input.taskName}» no se aprobó esta vez.`,
			url: CHILD_URL,
			tag: `report-${input.reportId}`,
			data: { reportId: input.reportId },
		};
	},
};
