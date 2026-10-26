import { describe, expect, test } from "bun:test";
import { normalizeRecoveryCode, ScryptRecoveryCodes } from "./recovery-codes";

const codes = new ScryptRecoveryCodes();

describe("ScryptRecoveryCodes", () => {
	test("generates long codes without ambiguous letters", () => {
		const generated = new Set(
			Array.from({ length: 50 }, () => codes.generate()),
		);
		expect(generated.size).toBe(50);
		for (const code of generated) {
			expect(code).toMatch(
				/^([0-9A-HJKMNP-TV-Z]{5}-){4}[0-9A-HJKMNP-TV-Z]{5}$/,
			);
		}
	});

	test("stores a salted hash that verifies the code, loosely typed", async () => {
		const code = codes.generate();
		const hash = await codes.hash(code);
		expect(hash).not.toContain(code.replaceAll("-", ""));
		expect(hash).not.toBe(await codes.hash(code));
		expect(await codes.verify(code, hash)).toBe(true);
		expect(
			await codes.verify(` ${code.toLowerCase().replaceAll("-", " ")} `, hash),
		).toBe(true);
		expect(await codes.verify(codes.generate(), hash)).toBe(false);
		expect(await codes.verify(code, "not-a-hash")).toBe(false);
	});

	test("letters that look like digits are read as digits", () => {
		expect(normalizeRecoveryCode("ol-i1 0")).toBe("01110");
	});
});
