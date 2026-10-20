// "Ahora" on the child's side: the session a parent started, read-only. A
// big countdown and the session's bricks draining while it runs; frozen while
// paused; past its end, the overrun in red and a calm word to switch off. A
// session scheduled for later counts down to "¡Ya puedes empezar!", and the
// tab rings then, at the warning and at the end. There are no controls here:
// only a parent starts, pauses or stops.
import { PartyPopper } from "lucide-react";
import { useEffect, useRef } from "react";
import {
	AmountBricks,
	BRICK_MINUTES,
	BrickRow,
	bricksFor,
	brickUnit,
	overrunBricks,
} from "../../components/bricks";
import { useToast } from "../../components/toast";
import { Callout } from "../../components/ui";
import { activityById, activityLook, bagFor } from "../../lib/activity";
import { ring, useSessionAlarm } from "../../lib/alarm";
import { serverNow, useServerNow } from "../../lib/clock";
import { countdown, minutesText, timeText } from "../../lib/format";
import { pausedSince, timing } from "../../lib/timer";
import type { Policy, Session } from "../../lib/types";
import { useChild } from "../context";

// How late "you can start" may still ring (the tab was asleep).
const READY_GRACE_MS = 20_000;
const readyRung = new Set<string>();

function ActivityTag({ activityId }: { activityId: string }) {
	const { activities } = useChild();
	const activity = activityById(activities, activityId);
	const look = activityLook(activity?.code);
	return (
		<span
			className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-white"
			style={{ background: look.color }}
		>
			<look.Icon className="size-4.5" aria-hidden="true" />
			{activity?.name ?? "Actividad"}
		</span>
	);
}

function sessionBricks(session: Session, remainingMs: number, color: string) {
	const plannedMinutes = session.plannedDurationSeconds / 60;
	const unit = brickUnit(plannedMinutes, 12);
	const remainingMinutes = remainingMs / 60_000;
	const bricks = [
		...bricksFor(Math.max(0, remainingMinutes), plannedMinutes, unit, color),
		...overrunBricks(-Math.min(0, remainingMinutes), unit),
	];
	return { bricks, unit, perRow: Math.min(12, Math.max(6, bricks.length)) };
}

// Rings once when a scheduled session reaches its start, on the server's
// clock, even if the next poll has not seen it running yet.
function useReadyAlarm(session: Session, onReady: () => void) {
	const onReadyRef = useRef(onReady);
	onReadyRef.current = onReady;
	const at =
		session.status === "scheduled" && session.scheduledStartAt !== null
			? Date.parse(session.scheduledStartAt)
			: null;
	const sessionId = session.id;
	useEffect(() => {
		if (at === null) {
			return;
		}
		const key = `${sessionId}:${at}`;
		const delay = at - serverNow();
		if (readyRung.has(key) || delay < -READY_GRACE_MS) {
			readyRung.add(key);
			return;
		}
		const timer = setTimeout(
			() => {
				if (readyRung.has(key)) {
					return;
				}
				readyRung.add(key);
				ring("ready");
				onReadyRef.current();
			},
			Math.max(0, delay),
		);
		return () => clearTimeout(timer);
	}, [sessionId, at]);
}

function Scheduled({ session, now }: { session: Session; now: number }) {
	const { activities, timeZone } = useChild();
	const activity = activityById(activities, session.activityId);
	const look = activityLook(activity?.code);
	const name = activity?.name ?? "pantalla";
	const startsAt = Date.parse(session.scheduledStartAt ?? "");
	const untilMs = startsAt - now;
	const minutes = session.plannedDurationSeconds / 60;
	const ready = untilMs <= 0;
	return (
		<Callout
			className="flex flex-col gap-4 p-4 sm:p-5"
			aria-labelledby="now-title"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 id="now-title" className="text-xl leading-tight font-semibold">
					{ready ? "¡Ya puedes empezar!" : "Más tarde"}
				</h2>
				<ActivityTag activityId={session.activityId} />
			</div>
			{ready ? (
				<div className="flex items-center gap-3">
					<PartyPopper
						className="size-10 shrink-0 text-ink"
						strokeWidth={1.75}
						aria-hidden="true"
					/>
					<p className="text-lg">
						Tu sesión de {minutesText(minutes)} de {name} está empezando.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-1">
					<p className="text-ink-soft">Faltan</p>
					<p
						className="tabular text-[4.5rem] leading-none font-extrabold tracking-[-0.02em]"
						aria-hidden="true"
					>
						{countdown(untilMs)}
					</p>
					<p className="text-lg">
						para empezar, a las {timeText(startsAt, timeZone)}
					</p>
					<p className="sr-only" aria-live="polite">
						Puedes empezar a las {timeText(startsAt, timeZone)}, en{" "}
						{minutesText(Math.ceil(untilMs / 60_000))}.
					</p>
				</div>
			)}
			<div className="flex flex-col gap-2">
				<AmountBricks
					minutes={minutes}
					color={look.color}
					label={`${minutesText(minutes)} de ${name}`}
				/>
				<p className="text-[0.9375rem] text-ink-soft">
					{minutesText(minutes)} de {name}. Hasta que empiece, no gasta nada.
				</p>
			</div>
		</Callout>
	);
}

function Running({
	session,
	now,
	warningMinutes,
}: {
	session: Session;
	now: number;
	warningMinutes: number;
}) {
	const { activities, timeZone } = useChild();
	const activity = activityById(activities, session.activityId);
	const look = activityLook(activity?.code);
	const t = timing(session, now);
	const paused = session.status === "paused";
	const over = t.remainingMs < 0;
	const pauseStart = pausedSince(session);
	const plannedMinutes = session.plannedDurationSeconds / 60;
	const { bricks, unit, perRow } = sessionBricks(
		session,
		t.remainingMs,
		look.color,
	);
	// Minutes round down, as the countdown does, so the numbers add up.
	const elapsedMinutes = Math.floor(t.elapsedMs / 60_000);
	const soon =
		!paused &&
		!over &&
		warningMinutes > 0 &&
		t.remainingMs <= warningMinutes * 60_000;

	return (
		<Callout
			tone={paused ? "pause" : "plain"}
			className="flex flex-col gap-4 p-4 sm:p-5"
			aria-labelledby="now-title"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2
					id="now-title"
					className={`text-xl leading-tight font-semibold ${paused ? "text-pause-ink" : ""}`}
				>
					{paused ? "En pausa" : over ? "Se acabó el tiempo" : "Ahora"}
				</h2>
				<ActivityTag activityId={session.activityId} />
			</div>

			<div className="flex flex-col gap-1">
				<p
					className={`tabular text-[4.5rem] leading-none font-extrabold tracking-[-0.02em] ${
						over ? "text-stop" : paused ? "text-pause-ink" : "text-ink"
					}`}
					aria-hidden="true"
				>
					{countdown(t.remainingMs)}
				</p>
				<p className="sr-only" aria-live="polite">
					{over
						? `Se acabó el tiempo hace ${minutesText(Math.ceil(-t.remainingMs / 60_000))}`
						: `Te quedan ${minutesText(Math.ceil(t.remainingMs / 60_000))}`}
				</p>
				<p className={`text-lg ${paused ? "text-pause-ink" : ""}`}>
					{paused
						? pauseStart === null
							? "Tu tiempo no corre mientras está en pausa."
							: `Tu tiempo no corre desde las ${timeText(pauseStart, timeZone)}.`
						: over
							? "Es hora de guardar y apagar. Lo que sigas usando también cuenta."
							: soon
								? "Ve terminando: ya casi se acaba."
								: `Termina a las ${timeText(t.endsAtMs ?? now, timeZone)}.`}
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<BrickRow
					bricks={bricks}
					perRow={perRow}
					label={`${minutesText(Math.max(0, t.remainingMs) / 60_000)} restantes de ${minutesText(plannedMinutes)}`}
				/>
				<p
					className={`text-[0.9375rem] ${paused ? "text-pause-ink" : "text-ink-soft"}`}
				>
					Llevas {minutesText(elapsedMinutes)} de {minutesText(plannedMinutes)}
					{session.overrideId !== null && " · con tiempo extra"}
					{unit !== BRICK_MINUTES && ` · 1 ladrillo = ${unit} min`}
				</p>
			</div>
		</Callout>
	);
}

export function NowCard({
	session,
	policies,
}: {
	session: Session;
	policies: readonly Policy[];
}) {
	const { activities } = useChild();
	const toast = useToast();
	const now = useServerNow();
	const name =
		activityById(activities, session.activityId)?.name ?? "tu sesión";
	const warningMinutes =
		bagFor(policies, session.activityId)?.warningMinutes ?? 0;
	const t = timing(session, now);

	useSessionAlarm(
		{ sessionId: session.id, endsAtMs: t.endsAtMs, warningMinutes },
		(kind) => {
			toast.show(
				"alarm",
				kind === "warning"
					? `${warningMinutes === 1 ? "Te queda" : "Te quedan"} ${warningMinutes} min de ${name}`
					: "Se acabó el tiempo",
				kind === "warning"
					? "Ve terminando para apagar a tiempo."
					: "Es hora de apagar. Avisa a mamá o papá para que detengan la sesión.",
			);
		},
	);
	useReadyAlarm(session, () => {
		toast.show(
			"alarm",
			"¡Ya puedes empezar!",
			`Tu sesión de ${name} empieza ahora.`,
		);
	});

	return session.status === "scheduled" ? (
		<Scheduled session={session} now={now} />
	) : (
		<Running session={session} now={now} warningMinutes={warningMinutes} />
	);
}
