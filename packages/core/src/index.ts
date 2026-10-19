// Public API of @time-craft/core: domain types and rules, use cases, ports
// and errors. In-memory fakes for tests live in @time-craft/core/testing.
export * from "./application";
export * from "./domain/actor";
export * from "./domain/alerts";
export * from "./domain/attribution";
export * from "./domain/balance";
export * from "./domain/bonus";
export * from "./domain/calendar";
export * from "./domain/family";
export * from "./domain/policy";
export * from "./domain/push";
export * from "./domain/request";
export * from "./domain/session";
export * from "./domain/values";
export * from "./errors";
export type * from "./ports";

export interface AppInfo {
	name: string;
	version: string;
}

export function appInfo(): AppInfo {
	return { name: "Time Craft", version: "0.1.0" };
}
