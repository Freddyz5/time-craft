// Postgres errors the adapters care about, whichever driver raised them
// (Drizzle wraps the driver's error in `cause`).
const UNIQUE_VIOLATION = "23505";

function sqlState(error: unknown): string | undefined {
	for (
		let current: unknown = error;
		typeof current === "object" && current !== null;
		current = (current as { cause?: unknown }).cause
	) {
		const code = (current as { code?: unknown }).code;
		if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
			return code;
		}
	}
	return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
	return sqlState(error) === UNIQUE_VIOLATION;
}
