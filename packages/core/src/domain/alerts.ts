// Scheduled jobs of a session (QStash messages with notBefore):
//   start      = starts a session scheduled for later
//   warning    = heads-up push warning_minutes before the end
//   end        = end push
//   auto_close = closes a forgotten session at end + auto_close_after_minutes
// Starting (or resuming) plans warning, end and auto_close; pausing cancels
// them; resuming plans new ones with the times recomputed.
import type { Session, SessionStatus } from "./session";
import { remainingSeconds } from "./session";
import { addMinutes, addSeconds } from "./values";

export type AlertType = "start" | "warning" | "end" | "auto_close";

export const RUNNING_ALERT_TYPES: readonly AlertType[] = [
	"warning",
	"end",
	"auto_close",
];

export interface SessionAlert {
	id: string;
	sessionId: string;
	alertType: AlertType;
	scheduledAt: Date;
	providerMessageId: string | null;
	sentAt: Date | null;
	cancelledAt: Date | null;
}

export interface AlertPlan {
	type: AlertType;
	at: Date;
}

export function isAlertPending(alert: SessionAlert): boolean {
	return alert.sentAt === null && alert.cancelledAt === null;
}

// The state a session must be in for its job to still make sense. QStash
// retries, and a job can outlive a pause or a manual stop.
export function expectedSessionStatus(type: AlertType): SessionStatus {
	return type === "start" ? "scheduled" : "running";
}

// Alerts for a running session, from now. Times already past are skipped
// (e.g. the warning when less than warning_minutes are left); auto_close
// always exists, so a forgotten session is always closed.
export function planRunningAlerts(
	session: Session,
	now: Date,
	settings: { warningMinutes: number; autoCloseAfterMinutes: number },
): AlertPlan[] {
	const endAt = addSeconds(now, remainingSeconds(session, now));
	const warningAt = addMinutes(endAt, -settings.warningMinutes);
	const autoCloseAt = addMinutes(endAt, settings.autoCloseAfterMinutes);
	const plans: AlertPlan[] = [];
	if (settings.warningMinutes > 0 && warningAt.getTime() > now.getTime()) {
		plans.push({ type: "warning", at: warningAt });
	}
	if (endAt.getTime() > now.getTime()) {
		plans.push({ type: "end", at: endAt });
	}
	plans.push({
		type: "auto_close",
		at: autoCloseAt.getTime() > now.getTime() ? autoCloseAt : now,
	});
	return plans;
}
