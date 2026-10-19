// Value objects and input checks. Durations are seconds inside core; minutes
// only appear where the schema or a person uses them (limits, requests).
import { invalidInput } from "../errors";

export const SECONDS_PER_MINUTE = 60;

// Upper bound for any minutes input: a whole day.
export const MAX_MINUTES = 24 * 60;

export function minutesToSeconds(minutes: number): number {
	return minutes * SECONDS_PER_MINUTE;
}

// Whole minutes left, rounded up: "quedan 5 min" until the last second.
export function secondsToMinutesCeil(seconds: number): number {
	return Math.ceil(seconds / SECONDS_PER_MINUTE);
}

export function addSeconds(at: Date, seconds: number): Date {
	return new Date(at.getTime() + seconds * 1000);
}

export function addMinutes(at: Date, minutes: number): Date {
	return addSeconds(at, minutesToSeconds(minutes));
}

export function positiveMinutes(
	value: number,
	field: string,
	max = MAX_MINUTES,
): number {
	if (!Number.isInteger(value) || value <= 0) {
		throw invalidInput(field, "must be a positive whole number of minutes");
	}
	if (value > max) {
		throw invalidInput(field, `must be at most ${max} minutes`);
	}
	return value;
}

export function nonNegativeMinutes(
	value: number,
	field: string,
	max = MAX_MINUTES,
): number {
	if (!Number.isInteger(value) || value < 0) {
		throw invalidInput(field, "must be zero or a positive whole number");
	}
	if (value > max) {
		throw invalidInput(field, `must be at most ${max} minutes`);
	}
	return value;
}

export function positiveInteger(
	value: number,
	field: string,
	max: number,
): number {
	if (!Number.isInteger(value) || value <= 0 || value > max) {
		throw invalidInput(field, `must be a whole number from 1 to ${max}`);
	}
	return value;
}

// Trimmed text; empty becomes null.
export function optionalText(
	value: string | null | undefined,
	field: string,
	maxLength: number,
): string | null {
	const text = value?.trim() ?? "";
	if (text.length === 0) {
		return null;
	}
	if (text.length > maxLength) {
		throw invalidInput(field, `must be at most ${maxLength} characters`);
	}
	return text;
}

export function requiredText(
	value: string | null | undefined,
	field: string,
	maxLength: number,
): string {
	const text = optionalText(value, field, maxLength);
	if (text === null) {
		throw invalidInput(field, "is required");
	}
	return text;
}
