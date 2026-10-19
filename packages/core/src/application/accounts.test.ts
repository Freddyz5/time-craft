import { beforeEach, describe, expect, test } from "bun:test";
import {
	createTestKit,
	type Household,
	seedHousehold,
	type TestKit,
} from "../testing";

const NOW = "2026-10-21T15:00:00-05:00";

let kit: TestKit;
let h: Household;

beforeEach(() => {
	kit = createTestKit(NOW);
	h = seedHousehold(kit);
});

describe("resolveActor", () => {
	test("the domain table decides: parent, child or nobody", async () => {
		expect(await kit.core.resolveActor({ authUserId: h.auth.dad })).toEqual(
			h.dad,
		);
		expect(await kit.core.resolveActor({ authUserId: h.auth.child })).toEqual(
			h.child,
		);
		expect(await kit.core.resolveActor({ authUserId: "stranger" })).toBeNull();
	});
});

describe("createChildAccount", () => {
	test("creates the login and the child row in the parent's family", async () => {
		const child = await kit.core.createChildAccount(h.mom, {
			name: "Lucía",
			username: "  Lucia_9 ",
			pin: "246810",
		});
		expect(child).toMatchObject({
			familyId: h.familyId,
			name: "Lucía",
			failedPinAttempts: 0,
		});
		const user = kit.identity.users.get(child.authUserId);
		expect(user).toMatchObject({ username: "lucia_9", password: "246810" });
		expect(
			await kit.core.resolveActor({ authUserId: child.authUserId }),
		).toEqual({ kind: "child", childId: child.id, familyId: h.familyId });
	});

	test("the username is unique across the app", async () => {
		await expect(
			kit.core.createChildAccount(h.mom, {
				name: "Otro",
				username: "mateo",
				pin: "246810",
			}),
		).rejects.toMatchObject({ code: "username_taken" });
	});

	test("the PIN has at least 6 digits", async () => {
		for (const pin of ["12345", "12345a", "1234567890123"]) {
			await expect(
				kit.core.createChildAccount(h.mom, {
					name: "Lucía",
					username: "lucia",
					pin,
				}),
			).rejects.toMatchObject({
				code: "invalid_input",
				details: { field: "pin" },
			});
		}
	});

	test("if the child row cannot be written, the login is removed", async () => {
		kit.db.repos.children.insert = async () => {
			throw new Error("connection lost");
		};
		await expect(
			kit.core.createChildAccount(h.mom, {
				name: "Lucía",
				username: "lucia",
				pin: "246810",
			}),
		).rejects.toThrow("connection lost");
		expect(
			[...kit.identity.users.values()].some(
				(user) => user.username === "lucia",
			),
		).toBe(false);
	});

	test("only parents create accounts", async () => {
		await expect(
			kit.core.createChildAccount(h.child, {
				name: "Amigo",
				username: "amigo",
				pin: "246810",
			}),
		).rejects.toMatchObject({ code: "forbidden" });
	});
});

describe("resetPassword", () => {
	test("a parent sets the other parent's password", async () => {
		await kit.core.resetPassword(h.mom, {
			target: { kind: "parent", parentId: h.dad.parentId },
			newPassword: "una clave larga",
		});
		expect(kit.identity.passwordOf(h.auth.dad)).toBe("una clave larga");
	});

	test("parents need at least 8 characters", async () => {
		await expect(
			kit.core.resetPassword(h.mom, {
				target: { kind: "parent", parentId: h.dad.parentId },
				newPassword: "1234567",
			}),
		).rejects.toMatchObject({ code: "invalid_input" });
	});

	test("not their own: that needs the current password", async () => {
		await expect(
			kit.core.resetPassword(h.mom, {
				target: { kind: "parent", parentId: h.mom.parentId },
				newPassword: "una clave larga",
			}),
		).rejects.toMatchObject({ code: "cannot_reset_own_password" });
	});

	test("a new PIN for the child also lifts the lockout", async () => {
		kit.db.set("children", {
			...kit.db.get("children", h.childId),
			failedPinAttempts: 5,
			lockedUntil: new Date("2026-10-21T21:00:00Z"),
		});
		await kit.core.resetPassword(h.dad, {
			target: { kind: "child", childId: h.childId },
			newPassword: "135790",
		});
		expect(kit.identity.passwordOf(h.auth.child)).toBe("135790");
		expect(kit.db.get("children", h.childId)).toMatchObject({
			failedPinAttempts: 0,
			lockedUntil: null,
		});
	});

	test("another family's parent or child is not found", async () => {
		const other = seedHousehold(kit, { prefix: "x-" });
		await expect(
			kit.core.resetPassword(h.mom, {
				target: { kind: "parent", parentId: other.dad.parentId },
				newPassword: "una clave larga",
			}),
		).rejects.toMatchObject({ code: "parent_not_found" });
		await expect(
			kit.core.resetPassword(h.mom, {
				target: { kind: "child", childId: other.childId },
				newPassword: "135790",
			}),
		).rejects.toMatchObject({ code: "child_not_found" });
		expect(kit.identity.passwordOf(other.auth.dad)).toBe("old-password");
		expect(kit.identity.passwordOf(other.auth.child)).toBe("123456");
	});

	test("the child cannot reset anything", async () => {
		await expect(
			kit.core.resetPassword(h.child, {
				target: { kind: "parent", parentId: h.mom.parentId },
				newPassword: "una clave larga",
			}),
		).rejects.toMatchObject({ code: "forbidden" });
	});
});

describe("recovery code", () => {
	test("is generated, stored hashed and shown once", async () => {
		const { recoveryCode } = await kit.core.regenerateRecoveryCode(h.mom);
		const family = kit.db.get("families", h.familyId);
		expect(family.recoveryCodeHash).toBe(`hashed:${recoveryCode}`);
		expect(family.recoveryCodeCreatedAt?.toISOString()).toBe(
			"2026-10-21T20:00:00.000Z",
		);
	});

	test("resets a parent's password once and is replaced by a new one", async () => {
		const { recoveryCode } = await kit.core.regenerateRecoveryCode(h.mom);
		const result = await kit.core.useRecoveryCode({
			email: " DAD@example.com ",
			code: recoveryCode,
			newPassword: "otra clave larga",
		});
		expect(kit.identity.passwordOf(h.auth.dad)).toBe("otra clave larga");
		expect(result.recoveryCode).not.toBe(recoveryCode);
		expect(kit.db.get("families", h.familyId).recoveryCodeHash).toBe(
			`hashed:${result.recoveryCode}`,
		);

		await expect(
			kit.core.useRecoveryCode({
				email: "dad@example.com",
				code: recoveryCode,
				newPassword: "y otra más",
			}),
		).rejects.toMatchObject({ code: "invalid_recovery_code" });
	});

	test("wrong code, unknown email and the child all fail the same way", async () => {
		await kit.core.regenerateRecoveryCode(h.mom);
		for (const email of [
			"mom@example.com",
			"nobody@example.com",
			"mateo@hijos.timecraft.local",
		]) {
			await expect(
				kit.core.useRecoveryCode({
					email,
					code: "WRONG",
					newPassword: "otra clave larga",
				}),
			).rejects.toMatchObject({ code: "invalid_recovery_code" });
		}
	});

	test("does not work for another family's parent", async () => {
		const other = seedHousehold(kit, { prefix: "x-" });
		const { recoveryCode } = await kit.core.regenerateRecoveryCode(h.mom);
		await kit.core.regenerateRecoveryCode(other.mom);
		await expect(
			kit.core.useRecoveryCode({
				email: "x-mom@example.com",
				code: recoveryCode,
				newPassword: "otra clave larga",
			}),
		).rejects.toMatchObject({ code: "invalid_recovery_code" });
	});

	test("only parents regenerate it", async () => {
		await expect(
			kit.core.regenerateRecoveryCode(h.child),
		).rejects.toMatchObject({
			code: "forbidden",
		});
	});
});
