// Public API of @time-craft/core: domain types and rules, and errors.
export * from "./domain/actor";
export * from "./domain/attribution";
export * from "./domain/balance";
export * from "./domain/calendar";
export * from "./domain/family";
export * from "./domain/policy";
export * from "./domain/session";
export * from "./domain/values";
export * from "./errors";

export interface AppInfo {
	name: string;
	version: string;
}

export function appInfo(): AppInfo {
	return { name: "Time Craft", version: "0.1.0" };
}
