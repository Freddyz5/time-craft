// Public API of @time-craft/core: domain types and rules, and errors.
export * from "./domain/actor";
export * from "./domain/family";
export * from "./domain/values";
export * from "./errors";

export interface AppInfo {
	name: string;
	version: string;
}

export function appInfo(): AppInfo {
	return { name: "Time Craft", version: "0.1.0" };
}
