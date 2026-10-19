// Request validation with zod. Schemas check shape and types; the business
// limits (minutes, lengths, PIN format) are core's, which answers with
// invalid_input as well. A failed check answers 400 in the common format.
import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import * as z from "zod";
import { HttpError } from "./errors";

export function validate<
	Target extends keyof ValidationTargets,
	Schema extends z.ZodType,
>(target: Target, schema: Schema) {
	return zValidator(target, schema, (result) => {
		if (!result.success) {
			throw new HttpError(400, "invalid_input", "The request is not valid", {
				target,
				issues: result.error.issues.map((issue) => ({
					path: issue.path.join("."),
					message: issue.message,
				})),
			});
		}
	});
}

// Building blocks shared by the routes.
export const id = z.uuid();

// An instant with its offset ("2026-10-21T18:30:00-05:00"), read as a Date.
export const instant = z.iso
	.datetime({ offset: true })
	.transform((value) => new Date(value));

export const minutes = z.int();

export const childParam = z.object({ childId: id });
