// Login secrets and names. Better Auth stores them; core only decides what is
// acceptable. The PIN floor (6 digits) is Better Auth's minPasswordLength;
// parents get a stricter rule on top.
// The child's lockout also lives here: Better Auth's rate limit is per IP, so
// wrong PINs are counted per child too (children.failed_pin_attempts).
import { invalidInput } from "../errors";
import type { Child } from "./family";
import { addMinutes } from "./values";

export const PIN_MIN_DIGITS = 6;
export const PIN_MAX_DIGITS = 12;
export const PARENT_PASSWORD_MIN_LENGTH = 8;
export const PARENT_PASSWORD_MAX_LENGTH = 128;

// Better Auth's username plugin defaults (lowercased, 3–30 characters).
const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

export function normalizeUsername(value: string): string {
	const username = value.trim().toLowerCase();
	if (!USERNAME_PATTERN.test(username)) {
		throw invalidInput(
			"username",
			"must be 3 to 30 letters, digits, dots or underscores",
		);
	}
	return username;
}

export function validatePin(pin: string): string {
	if (
		!/^\d+$/.test(pin) ||
		pin.length < PIN_MIN_DIGITS ||
		pin.length > PIN_MAX_DIGITS
	) {
		throw invalidInput(
			"pin",
			`must be ${PIN_MIN_DIGITS} to ${PIN_MAX_DIGITS} digits`,
		);
	}
	return pin;
}

export function validateParentPassword(password: string): string {
	if (
		password.length < PARENT_PASSWORD_MIN_LENGTH ||
		password.length > PARENT_PASSWORD_MAX_LENGTH ||
		password.trim().length === 0
	) {
		throw invalidInput(
			"password",
			`must be ${PARENT_PASSWORD_MIN_LENGTH} to ${PARENT_PASSWORD_MAX_LENGTH} characters`,
		);
	}
	return password;
}

export function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

// Wrong PINs in a row that lock the child out, and for how long.
export const MAX_FAILED_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_MINUTES = 15;

export function isLockedOut(child: Child, now: Date): boolean {
	return (
		child.lockedUntil !== null && child.lockedUntil.getTime() > now.getTime()
	);
}

// One more wrong PIN. The last allowed one locks the child out and starts the
// count again, so after the lockout they get the same number of tries.
export function recordFailedPin(child: Child, now: Date): Child {
	const attempts = child.failedPinAttempts + 1;
	if (attempts >= MAX_FAILED_PIN_ATTEMPTS) {
		return {
			...child,
			failedPinAttempts: 0,
			lockedUntil: addMinutes(now, PIN_LOCKOUT_MINUTES),
		};
	}
	return { ...child, failedPinAttempts: attempts };
}

// A right PIN clears the count and any lockout that already ended.
export function recordSuccessfulPin(child: Child): Child {
	return { ...child, failedPinAttempts: 0, lockedUntil: null };
}
