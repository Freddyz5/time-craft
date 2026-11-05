import { describe, expect, test } from "bun:test";
import { environmentOf } from "./environment";

describe("environmentOf", () => {
	test("production is Vercel's Production, whatever the branch", () => {
		expect(
			environmentOf({
				VERCEL_ENV: "production",
				VERCEL_GIT_COMMIT_REF: "prod",
			}),
		).toBe("production");
	});

	test("dev is the Preview of the dev branch", () => {
		expect(
			environmentOf({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "dev" }),
		).toBe("dev");
	});

	test("any other Preview deployment is a preview", () => {
		expect(
			environmentOf({
				VERCEL_ENV: "preview",
				VERCEL_GIT_COMMIT_REF: "feat/something",
			}),
		).toBe("preview");
		expect(environmentOf({ VERCEL_ENV: "preview" })).toBe("preview");
	});

	test("outside Vercel, or under vercel dev, it is local", () => {
		expect(environmentOf({})).toBe("local");
		expect(environmentOf({ VERCEL_ENV: "development" })).toBe("local");
	});
});
