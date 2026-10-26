// The real clock and uuid ids for new rows.
import { randomUUID } from "node:crypto";
import type { Clock, IdGenerator } from "@time-craft/core";

export const systemClock: Clock = {
	now: () => new Date(),
};

export const uuidIds: IdGenerator = {
	next: () => randomUUID(),
};
