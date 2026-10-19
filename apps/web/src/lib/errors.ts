// What to tell a person when something fails. The api answers with a stable
// code (core's public contract); the text shown is chosen here, in Spanish.
import { ApiError } from "./api";

const messages: Record<string, string> = {
	network_error: "No hay conexión con el servidor. Revisa tu internet.",
	unauthenticated: "Tu sesión terminó. Vuelve a entrar.",
	no_role: "Esta cuenta no pertenece a ninguna familia.",
	rate_limited:
		"Demasiados intentos seguidos. Espera un rato y prueba otra vez.",
	invalid_request: "La solicitud no es válida.",
	internal_error: "Algo salió mal en el servidor. Prueba otra vez.",

	invalid_start_time: "La hora de inicio tiene que ser más tarde, hoy mismo.",
	exceeds_requested: "No puedes aprobar más minutos de los que pidió.",
	invalid_recovery_code:
		"El correo o el código de recuperación no son válidos.",
	forbidden: "No tienes permiso para hacer esto.",
	cannot_reset_own_password:
		"Tu propia contraseña se cambia con la actual, desde «Mi contraseña».",
	child_locked: "Demasiados PIN incorrectos: la cuenta está bloqueada un rato.",

	family_not_found: "No encontramos la familia.",
	parent_not_found: "Ese padre ya no existe.",
	child_not_found: "No encontramos la cuenta del niño.",
	activity_not_found: "Esa actividad ya no existe.",
	request_not_found: "Esa solicitud ya no existe.",
	session_not_found: "Esa sesión ya no existe.",
	bonus_task_not_found: "Esa tarea ya no existe.",
	task_report_not_found: "Ese reporte ya no existe.",
	login_not_found: "Ese dispositivo ya había cerrado sesión.",

	request_already_pending: "Ya hay una solicitud pendiente.",
	request_already_resolved:
		"Esta solicitud ya fue respondida, quizá por el otro padre.",
	request_expired: "La solicitud expiró antes de responderla.",
	report_already_pending: "Esa tarea ya está reportada y pendiente.",
	report_already_reviewed:
		"Este reporte ya fue revisado, quizá por el otro padre.",
	session_already_open:
		"Ya hay una sesión programada, en curso o pausada. Termínala primero.",
	invalid_session_transition:
		"La sesión cambió mientras tanto. Ya actualizamos la vista.",
	concurrent_update: "Algo cambió mientras tanto. Vuelve a intentarlo.",
	username_taken: "Ese usuario ya existe. Elige otro.",

	no_active_policy: "Todavía no hay reglas: define los límites primero.",
	activity_inactive: "Esa actividad está desactivada.",
	bonus_task_inactive: "Esa tarea está desactivada.",
	quota_exhausted: "No le queda tiempo disponible.",
	quota_not_exhausted:
		"Todavía le queda tiempo: inicia una sesión normal en lugar de dar tiempo extra.",
	weekly_task_limit_reached: "Esa tarea ya llegó a su máximo de esta semana.",

	// Better Auth
	INVALID_EMAIL_OR_PASSWORD: "El correo o la contraseña no son correctos.",
	INVALID_EMAIL: "Escribe un correo válido.",
	INVALID_PASSWORD: "La contraseña actual no es correcta.",
	PASSWORD_TOO_SHORT: "La contraseña es demasiado corta.",
	PASSWORD_TOO_LONG: "La contraseña es demasiado larga.",
	INVALID_USERNAME_OR_PASSWORD: "El usuario o el PIN no son correctos.",
	TOO_MANY_REQUESTS:
		"Demasiados intentos seguidos. Espera un rato y prueba otra vez.",
	http_429: "Demasiados intentos seguidos. Espera un rato y prueba otra vez.",
};

// Field-specific texts for invalid_input (core names the field).
const fieldMessages: Record<string, string> = {
	weeklyLimitMinutes: "El límite semanal no puede ser menor que el diario.",
	dailyLimitMinutes: "El límite diario tiene que ser de 1 a 1.440 minutos.",
	weeklyBonusCapMinutes: "El tope de bonos tiene que ser 0 o más minutos.",
	warningMinutes: "El aviso previo tiene que ser de 0 a 1.440 minutos.",
	minutes: "Los minutos tienen que ser un número entero mayor que 0.",
	approvedMinutes: "Los minutos tienen que ser un número entero mayor que 0.",
	extraMinutes:
		"Los minutos extra tienen que ser un número entero mayor que 0.",
	awardedMinutes: "Los minutos tienen que ser un número entero mayor que 0.",
	rewardMinutes: "La recompensa tiene que ser de 1 a 1.440 minutos.",
	maxPerWeek: "El máximo por semana tiene que ser de 1 a 100 veces.",
	reason: "Escribe el motivo.",
	name: "Escribe un nombre.",
	username:
		"El usuario lleva de 3 a 30 letras, números, puntos o guiones bajos.",
	pin: "El PIN lleva de 6 a 12 dígitos.",
	password: "La contraseña lleva de 8 a 128 caracteres.",
	note: "La nota es demasiado larga.",
	description: "La descripción es demasiado larga.",
	period: "El periodo no es válido.",
	to: "El periodo no es válido.",
};

function minutesFrom(seconds: unknown): number | null {
	return typeof seconds === "number" ? Math.floor(seconds / 60) : null;
}

export function errorMessage(error: unknown): string {
	if (!(error instanceof ApiError)) {
		return "Algo salió mal. Prueba otra vez.";
	}
	if (error.code === "invalid_input") {
		const field = error.details.field;
		if (typeof field === "string" && field in fieldMessages) {
			return fieldMessages[field] as string;
		}
		return "Revisa los datos: hay un valor que no es válido.";
	}
	if (error.code === "exceeds_available") {
		const available = minutesFrom(error.details.availableSeconds);
		return available === null
			? "Es más tiempo del que tiene disponible."
			: `Es más tiempo del que tiene disponible: como máximo ${available} min.`;
	}
	return (
		messages[error.code] ??
		(error.status >= 500
			? messages.internal_error
			: "No se pudo completar. Prueba otra vez.") ??
		""
	);
}
