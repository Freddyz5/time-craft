// What to tell the child when something fails, in their own voice (the
// shared texts in lib/errors.ts talk to a parent about the child). Codes
// without a text of their own here fall back to the shared ones.
import { ApiError } from "../lib/api";
import { errorMessage } from "../lib/errors";

const messages: Record<string, string> = {
	unauthenticated: "Tu sesión terminó. Vuelve a entrar con tu PIN.",
	forbidden: "Eso lo deciden mamá o papá.",
	no_active_policy:
		"Todavía no hay reglas de tiempo. Pídele a mamá o papá que las pongan.",
	activity_inactive: "Esa actividad ya no está disponible.",
	quota_exhausted: "Ya no te queda tiempo hoy. Puedes pedir tiempo extra.",
	quota_not_exhausted:
		"Todavía te queda tiempo: pide para empezar, no tiempo extra.",
	request_already_pending: "Ya tienes un pedido esperando respuesta.",
	request_already_resolved: "Ese pedido ya tenía respuesta.",
	request_expired: "Ese pedido ya había expirado.",
	request_not_found: "Ese pedido ya no existe.",
	session_already_open:
		"Ya tienes una sesión. Cuando termine vas a poder pedir otra.",
	bonus_task_inactive: "Esa tarea ya no está disponible.",
	bonus_task_not_found: "Esa tarea ya no existe.",
	report_already_pending: "Esa tarea ya está esperando que la revisen.",
	weekly_task_limit_reached:
		"Ya hiciste esa tarea todas las veces que vale esta semana.",
	child_locked: "Tu cuenta descansa un rato por muchos PIN incorrectos.",
	INVALID_USERNAME_OR_PASSWORD: "Ese usuario y ese PIN no coinciden.",
};

const fieldMessages: Record<string, string> = {
	reason: "Cuenta por qué lo necesitas.",
	requestedMinutes: "Elige cuántos minutos quieres.",
	note: "La nota es demasiado larga.",
};

export function childErrorMessage(error: unknown): string {
	if (error instanceof ApiError) {
		if (error.code === "invalid_input") {
			const field = error.details.field;
			if (typeof field === "string" && field in fieldMessages) {
				return fieldMessages[field] as string;
			}
		}
		if (error.code === "exceeds_available") {
			const seconds = error.details.availableSeconds;
			return typeof seconds === "number"
				? `Es más de lo que te queda: como máximo ${Math.floor(seconds / 60)} min.`
				: "Es más de lo que te queda.";
		}
		const text = messages[error.code];
		if (text !== undefined) {
			return text;
		}
	}
	return errorMessage(error);
}
