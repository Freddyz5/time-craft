import { describe, expect, test } from "bun:test";
import { appInfo } from "./index";

describe("appInfo", () => {
	test("returns the app name and version", () => {
		expect(appInfo()).toEqual({ name: "Time Craft", version: "0.1.0" });
	});
});
