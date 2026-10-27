// "Ahora" on the child's side: the session a parent started, read-only. A
// big countdown and the session's bricks draining while it runs; frozen while
// paused; past its end, a fixed "¡Se acabó!" (no growing number to beat),
// the overrun brick and a calm word to switch off. A session scheduled for
// later counts down to "¡Ya puedes empezar!", and the tab rings then, at the
// warning and at the end. When it arrives with a parent's yes, its bricks
// snap in. While it runs, the plate takes the activity's colour and the
// countdown sits on a printed tile, as on the parents' side. There are no
// controls here: only a parent starts, pauses or stops.
import { CirclePlay } from "lucide-react";
import { type CSSProperties, useEffect, useRef } from "react";
import {
	AmountBricks,
	BRICK_MINUTES,
	BrickTower,
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

function ActivityTag({
	activityId,
	onPlate = false,
}: {
	activityId: string;
	// On the activity's own plate the tag turns white.
	onPlate?: boolean;
}) {
	const { activities } = useChild();
	const activity = activityById(activities, activityId);
	const look = activityLook(activity?.code);
	return (
		<span
			className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold text-white"
			style={
				onPlate
					? { background: "#ffffff", color: look.plate.face }
					: { background: look.color }
			}
		>
			<look.Icon className="size-4.5" aria-hidden="true" />
			{activity?.name ?? "Actividad"}
		</span>
	);
}

function sessionBricks(
	session: Session,
	remainingMs: number,
	color: string,
	outline?: string,
) {
	const plannedMinutes = session.plannedDurationSeconds / 60;
	const unit = brickUnit(plannedMinutes, 12);
	const remainingMinutes = remainingMs / 60_000;
	const bricks = [
		...bricksFor(
			Math.max(0, remainingMinutes),
			plannedMinutes,
			unit,
			color,
			outline,
		),
		...overrunBricks(-Math.min(0, remainingMinutes), unit),
	];
	return { bricks, unit };
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

function Scheduled({
	session,
	now,
	enter,
}: {
	session: Session;
	now: number;
	enter: boolean;
}) {
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
				<h2 id="now-title" className="text-[1.375rem] leading-tight font-bold">
					{ready ? "¡Ya puedes empezar!" : "Tu próxima sesión"}
				</h2>
				<ActivityTag activityId={session.activityId} />
			</div>
			{ready ? (
				<div className="flex items-center gap-3">
					<CirclePlay
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
						className="tabular font-display text-[4.5rem] leading-none font-extrabold tracking-[-0.02em]"
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
					enter={enter}
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
	enter,
}: {
	session: Session;
	now: number;
	warningMinutes: number;
	enter: boolean;
}) {
	const { activities, timeZone } = useChild();
	const activity = activityById(activities, session.activityId);
	const look = activityLook(activity?.code);
	const name = activity?.name ?? "pantalla";
	const t = timing(session, now);
	const paused = session.status === "paused";
	const over = t.remainingMs < 0;
	const pauseStart = pausedSince(session);
	const plannedMinutes = session.plannedDurationSeconds / 60;
	// Running on time: the plate is the activity's, its bricks white plastic.
	const running = !paused && !over;
	const { bricks, unit } = sessionBricks(
		session,
		t.remainingMs,
		running ? "#ffffff" : look.color,
		running ? "rgb(255 255 255 / 0.6)" : undefined,
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
			className={`flex flex-col gap-4 p-4 sm:p-5 ${running ? "text-white [--color-focus:#ffffff]" : ""}`}
			style={
				running
					? ({
							"--plate-face": look.plate.face,
							"--plate-side": look.plate.side,
						} as CSSProperties)
					: undefined
			}
			aria-labelledby="now-title"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2
					id="now-title"
					className={`text-[1.375rem] leading-tight font-bold ${paused ? "text-pause-ink" : ""}`}
				>
					{paused ? "En pausa" : "Ahora"}
				</h2>
				<ActivityTag activityId={session.activityId} onPlate={running} />
			</div>

			<div className="flex flex-col gap-2">
				{/* The countdown, printed on a dark tile while it runs, with the
				    session's bricks stacked beside it as a tower. */}
				<div
					className={`flex flex-wrap items-end justify-between gap-x-4 gap-y-3 ${
						running
							? "rounded-control bg-black/25 px-4 pt-3 pb-3 shadow-[inset_0_3px_0_rgb(0_0_0/0.22),inset_0_-2px_0_rgb(255_255_255/0.1)]"
							: ""
					}`}
				>
					{over ? (
						<p
							className="font-display text-[3.5rem] leading-none font-extrabold tracking-[-0.02em] text-stop"
							role="status"
							aria-label={`Se acabó tu sesión de ${name}`}
						>
							¡Se acabó!
						</p>
					) : (
						<>
							<p
								className={`tabular pt-1 font-display text-[4.5rem] leading-none font-extrabold tracking-[-0.02em] ${
									paused ? "text-pause-ink" : "text-white"
								}`}
								aria-hidden="true"
							>
								{countdown(t.remainingMs)}
							</p>
							<p className="sr-only" aria-live="polite">
								Te quedan {minutesText(Math.ceil(t.remainingMs / 60_000))}
							</p>
						</>
					)}
					<BrickTower
						bricks={bricks}
						enter={enter}
						label={
							over
								? `Tu sesión de ${minutesText(plannedMinutes)} terminó`
								: `${minutesText(Math.max(0, t.remainingMs) / 60_000)} restantes de ${minutesText(plannedMinutes)}`
						}
					/>
				</div>
				<p
					className={`text-lg ${paused ? "text-pause-ink" : running ? "text-white" : ""}`}
				>
					{paused
						? pauseStart === null
							? "Tu tiempo no corre mientras está en pausa."
							: `Tu tiempo no corre desde las ${timeText(pauseStart, timeZone)}.`
						: over
							? "Guarda y apaga. Lo que sigas usando también cuenta."
							: soon
								? "Ve terminando: ya casi se acaba."
								: `Termina a las ${timeText(t.endsAtMs ?? now, timeZone)}.`}
				</p>
				<p
					className={`text-[0.9375rem] ${paused ? "text-pause-ink" : running ? "text-white/85" : "text-ink-soft"}`}
				>
					{over
						? `Tu sesión era de ${minutesText(plannedMinutes)}`
						: `Llevas ${minutesText(elapsedMinutes)} de ${minutesText(plannedMinutes)}`}
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
	enter = false,
}: {
	session: Session;
	policies: readonly Policy[];
	// A parent just said yes: the session's bricks snap in.
	enter?: boolean;
}) {
	const { activities } = useChild();
	const toast = useToast();
	const now = useServerNow();
	const name = activityById(activities, session.activityId)?.name ?? "pantalla";
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
					: `Se acabó tu sesión de ${name}`,
				kind === "warning"
					? "Ve terminando para apagar a tiempo."
					: "Guarda y apaga. Avisa a mamá o papá para que la detengan.",
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
		<Scheduled session={session} now={now} enter={enter} />
	) : (
		<Running
			session={session}
			now={now}
			warningMinutes={warningMinutes}
			enter={enter}
		/>
	);
}
