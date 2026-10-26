// The live countdown, from what the server returned: start, planned duration
// and pauses. Like the server, elapsed = now − started_at − Σ pauses (an open
// pause counts up to now). `now` is the server's clock (see clock.ts), so
// every device shows the same numbers. This is the only time math the web
// does; balances always come from the api.

export interface TimedSession {
	status: string;
	startedAt: string | null;
	endedAt: string | null;
	plannedDurationSeconds: number;
	pauses: readonly { pausedAt: string; resumedAt: string | null }[];
}

export interface Timing {
	elapsedMs: number;
	// Negative once past the planned end.
	remainingMs: number;
	// The planned end while running; null when paused, scheduled or closed.
	endsAtMs: number | null;
}

function pausedMs(session: TimedSession, until: number): number {
	return session.pauses.reduce((total, pause) => {
		const end = pause.resumedAt === null ? until : Date.parse(pause.resumedAt);
		return total + Math.max(0, end - Date.parse(pause.pausedAt));
	}, 0);
}

export function timing(session: TimedSession, now: number): Timing {
	const planned = session.plannedDurationSeconds * 1000;
	if (session.startedAt === null) {
		return { elapsedMs: 0, remainingMs: planned, endsAtMs: null };
	}
	const started = Date.parse(session.startedAt);
	const until = session.endedAt === null ? now : Date.parse(session.endedAt);
	const elapsedMs = Math.max(0, until - started - pausedMs(session, until));
	const running = session.status === "running";
	return {
		elapsedMs,
		remainingMs: planned - elapsedMs,
		// Closed pauses only: a running session has no open one.
		endsAtMs: running ? started + planned + pausedMs(session, until) : null,
	};
}

// When the open pause started, if the session is paused.
export function pausedSince(session: TimedSession): number | null {
	const open = session.pauses.find((pause) => pause.resumedAt === null);
	return open === undefined ? null : Date.parse(open.pausedAt);
}
