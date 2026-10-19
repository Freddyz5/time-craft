// Entry point for scheduled jobs (QStash calls the api, the api calls this).
// Idempotent: QStash retries and messages can outlive the state they were
// meant for, so a job does nothing if its alert was already sent or
// cancelled, or if the session is not in the state the job expects.
import type { AlertType } from "../domain/alerts";
import { expectedSessionStatus } from "../domain/alerts";
import { messages } from "../domain/push";
import { remainingSeconds } from "../domain/session";
import { secondsToMinutesCeil } from "../domain/values";
import {
	loadActivity,
	loadChildById,
	loadFamily,
	parentUserIds,
} from "./access";
import { type CoreDeps, transaction } from "./context";
import { autoCloseSession, startScheduledSession } from "./sessions";

export type IgnoredJobReason =
	| "alert_not_found"
	| "already_sent"
	| "already_cancelled"
	| "session_not_found"
	| "unexpected_session_state";

export type JobOutcome =
	| { status: "handled"; alertType: AlertType; sessionId: string }
	| { status: "ignored"; reason: IgnoredJobReason };

function ignored(reason: IgnoredJobReason): JobOutcome {
	return { status: "ignored", reason };
}

export async function handleJob(
	deps: CoreDeps,
	input: { alertId: string },
): Promise<JobOutcome> {
	return transaction(deps, async (tx) => {
		const alert = await tx.repos.alerts.findById(input.alertId);
		if (alert === null) {
			// e.g. its transaction rolled back after the job was published.
			return ignored("alert_not_found");
		}
		if (alert.cancelledAt !== null) {
			return ignored("already_cancelled");
		}
		if (alert.sentAt !== null) {
			return ignored("already_sent");
		}
		const session = await tx.repos.sessions.findById(alert.sessionId);
		if (session === null) {
			return ignored("session_not_found");
		}
		if (session.status !== expectedSessionStatus(alert.alertType)) {
			return ignored("unexpected_session_state");
		}
		// Claims the alert: of two concurrent deliveries, only one gets here.
		if (!(await tx.repos.alerts.markSentIfPending(alert.id, tx.now))) {
			return ignored("already_sent");
		}

		switch (alert.alertType) {
			case "start":
				await startScheduledSession(tx, session);
				break;
			case "auto_close":
				await autoCloseSession(tx, session);
				break;
			case "warning":
			case "end": {
				const child = await loadChildById(tx, session.childId);
				const family = await loadFamily(tx, child.familyId);
				const activity = await loadActivity(tx, family.id, session.activityId, {
					requireActive: false,
				});
				const text = {
					sessionId: session.id,
					childName: child.name,
					activityName: activity.name,
				};
				const parents = await parentUserIds(tx, family.id);
				if (alert.alertType === "warning") {
					const minutesLeft = secondsToMinutesCeil(
						Math.max(0, remainingSeconds(session, tx.now)),
					);
					tx.after.notify(
						parents,
						messages.sessionWarning({
							...text,
							minutesLeft,
							audience: "parents",
						}),
					);
					tx.after.notify(
						[child.authUserId],
						messages.sessionWarning({
							...text,
							minutesLeft,
							audience: "child",
						}),
					);
				} else {
					tx.after.notify(
						parents,
						messages.sessionEnded({ ...text, audience: "parents" }),
					);
					tx.after.notify(
						[child.authUserId],
						messages.sessionEnded({ ...text, audience: "child" }),
					);
				}
				break;
			}
		}
		return {
			status: "handled",
			alertType: alert.alertType,
			sessionId: session.id,
		};
	});
}
