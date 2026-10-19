import { describe, expect, test } from "bun:test";
import { DomainError, errorKinds, invalidInput, isDomainError } from "./errors";

describe("DomainError", () => {
	test("carries a stable code, its kind and details", () => {
		const error = new DomainError("exceeds_available", "Too long", {
			availableSeconds: 600,
		});
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("DomainError");
		expect(error.code).toBe("exceeds_available");
		expect(error.kind).toBe("rule");
		expect(error.details).toEqual({ availableSeconds: 600 });
		expect(isDomainError(error)).toBe(true);
		expect(isDomainError(new Error("boom"))).toBe(false);
	});

	test("every code maps to a known kind", () => {
		const kinds = new Set([
			"validation",
			"unauthorized",
			"forbidden",
			"not_found",
			"conflict",
			"rule",
		]);
		for (const kind of Object.values(errorKinds)) {
			expect(kinds.has(kind)).toBe(true);
		}
	});

	test("invalidInput names the field", () => {
		expect(invalidInput("pin", "too short")).toMatchObject({
			code: "invalid_input",
			kind: "validation",
			details: { field: "pin", reason: "too short" },
		});
	});
});
