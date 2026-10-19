// The family's recovery code: 25 random characters from Crockford's base32
// (125 bits), shown in groups of five for writing down. Only an scrypt hash
// is stored. Reading it back forgives case, spaces, dashes and the letters
// that look like digits.
import {
	randomBytes,
	type ScryptOptions,
	scrypt,
	timingSafeEqual,
} from "node:crypto";
import type { RecoveryCodeService } from "@time-craft/core";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUPS = 5;
const GROUP_LENGTH = 5;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(
	code: string,
	salt: Buffer,
	params: ScryptOptions,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(code, salt, KEY_LENGTH, params, (error, key) =>
			error ? reject(error) : resolve(key),
		);
	});
}

// What the person typed, as generated: uppercase, without separators, with
// O → 0 and I/L → 1.
export function normalizeRecoveryCode(code: string): string {
	return code
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, "")
		.replace(/O/g, "0")
		.replace(/[IL]/g, "1");
}

export class ScryptRecoveryCodes implements RecoveryCodeService {
	generate(): string {
		// 256 is a multiple of 32, so `byte % 32` is uniform.
		const characters = [...randomBytes(GROUPS * GROUP_LENGTH)].map(
			(byte) => ALPHABET[byte % ALPHABET.length],
		);
		const groups: string[] = [];
		for (let start = 0; start < characters.length; start += GROUP_LENGTH) {
			groups.push(characters.slice(start, start + GROUP_LENGTH).join(""));
		}
		return groups.join("-");
	}

	// scrypt$N$r$p$salt$key, in base64url.
	async hash(code: string): Promise<string> {
		const salt = randomBytes(SALT_BYTES);
		const key = await derive(normalizeRecoveryCode(code), salt, PARAMS);
		return [
			"scrypt",
			PARAMS.N,
			PARAMS.r,
			PARAMS.p,
			salt.toString("base64url"),
			key.toString("base64url"),
		].join("$");
	}

	async verify(code: string, hash: string): Promise<boolean> {
		const [scheme, n, r, p, salt, key] = hash.split("$");
		if (scheme !== "scrypt" || salt === undefined || key === undefined) {
			return false;
		}
		const expected = Buffer.from(key, "base64url");
		const actual = await derive(
			normalizeRecoveryCode(code),
			Buffer.from(salt, "base64url"),
			{ N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem },
		);
		return (
			actual.length === expected.length && timingSafeEqual(actual, expected)
		);
	}
}
