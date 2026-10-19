// Login secrets and names. Better Auth stores them; core only decides what is
// acceptable. The PIN floor (6 digits) is Better Auth's minPasswordLength;
// parents get a stricter rule on top.
import { invalidInput } from "../errors";

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
