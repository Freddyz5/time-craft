export interface AppInfo {
	name: string;
	version: string;
}

export function appInfo(): AppInfo {
	return { name: "Time Craft", version: "0.1.0" };
}
