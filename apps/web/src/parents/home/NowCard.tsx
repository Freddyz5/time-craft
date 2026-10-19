// "Ahora": the child's open session (running, paused or scheduled) with its
// countdown and controls, or what can be started when there is none. The
// countdown runs on the server's clock.
import { CalendarClock, Pause, Play, Plus, Square, X } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import {
	BRICK_MINUTES,
	BrickRow,
	bricksFor,
	brickUnit,
	overrunBricks,
} from "../../components/bricks";
import {
	Button,
	buttonClass,
	Callout,
	ConfirmDialog,
} from "../../components/ui";
import { activityById, activityLook } from "../../lib/activity";
import { api, call } from "../../lib/api";
import { useServerNow } from "../../lib/clock";
import {
	countdown,
	dayText,
	minutesText,
	secondsText,
	timeText,
} from "../../lib/format";
import { pausedSince, timing } from "../../lib/timer";
import type { Balance, LiveView, Policy, Session } from "../../lib/types";
import { parentName, useParents } from "../context";
import { useCommand } from "../useCommand";

// From here on a pause counts as forgotten and the card asks to close it.
export const LONG_PAUSE_MINUTES = 30;

function ActivityTag({ activityId }: { activityId: string }) {
	const { activities } = useParents();
	const activity = activityById(activities, activityId);
	const look = activityLook(activity?.code);
	return (
		<span
			className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-white"
			style={{ background: look.color }}
		>
			<look.Icon className="size-4" aria-hidden="true" />
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

function useSessionCommands(session: Session, activityName: string) {
	const sessionId = session.id;
	const param = { param: { sessionId } };
	return {
		pause: useCommand(
			() =>
				call(api.sessions[":sessionId"].pause.$post({ ...param, json: {} })),
			{
				success: `${activityName} en pausa: no gasta tiempo`,
			},
		),
		resume: useCommand(
			() => call(api.sessions[":sessionId"].resume.$post(param)),
			{
				success: `${activityName} sigue corriendo`,
			},
		),
		stop: useCommand(() => call(api.sessions[":sessionId"].stop.$post(param)), {
			success: (result) =>
				`Sesión terminada: contó ${secondsText(result.session.consumedSeconds ?? 0, true)}`,
		}),
		start: useCommand(
			() => call(api.sessions[":sessionId"].start.$post(param)),
			{
				success: `${activityName} empezó ahora`,
			},
		),
		cancel: useCommand(
			() => call(api.sessions[":sessionId"].cancel.$post(param)),
			{
				success: "Sesión programada cancelada",
			},
		),
	};
}

function LiveSession({
	session,
}: {
	session: Session;
	// The tab's alarm reads the warning time from them (next commit).
	policies: readonly Policy[];
}) {
	const { household, activities, timeZone } = useParents();
	const now = useServerNow();
	const [confirm, setConfirm] = useState<"stop" | "cancel" | null>(null);
	const activity = activityById(activities, session.activityId);
	const look = activityLook(activity?.code);
	const name = activity?.name ?? "La sesión";
	const commands = useSessionCommands(session, name);
	const t = timing(session, now);
	const paused = session.status === "paused";
	const scheduled = session.status === "scheduled";
	const over = !scheduled && t.remainingMs < 0;
	const pauseStart = pausedSince(session);
	const pausedMinutes =
		pauseStart === null ? 0 : Math.floor((now - pauseStart) / 60_000);
	const longPause = paused && pausedMinutes >= LONG_PAUSE_MINUTES;
	const { bricks, unit, perRow } = sessionBricks(
		session,
		scheduled ? session.plannedDurationSeconds * 1000 : t.remainingMs,
		look.color,
	);
	const busy = Object.values(commands).some((command) => command.isPending);
	const startedBy = parentName(household, session.startedByParentId);
	const elapsedMinutes = Math.ceil(t.elapsedMs / 60_000);

	let status: string;
	if (scheduled) {
		const at = session.scheduledStartAt ?? "";
		const inMinutes = Math.max(0, Math.ceil((Date.parse(at) - now) / 60_000));
		status = `Programada para las ${timeText(at, timeZone)} · empieza en ${minutesText(inMinutes)}`;
	} else if (paused) {
		status =
			pauseStart === null
				? "En pausa"
				: `En pausa desde las ${timeText(pauseStart, timeZone)} · hace ${minutesText(pausedMinutes)}`;
	} else if (over) {
		status = "Se pasó del tiempo: todo lo que siga corriendo cuenta";
	} else {
		status = `Termina a las ${timeText(t.endsAtMs ?? now, timeZone)}`;
	}

	return (
		<Callout
			tone={longPause ? "stop" : paused ? "pause" : "plain"}
			className="flex flex-col gap-4 p-4 sm:p-5"
			aria-labelledby="now-title"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 id="now-title" className="text-lg font-semibold">
					{longPause
						? `Lleva ${minutesText(pausedMinutes)} en pausa`
						: scheduled
							? "Más tarde"
							: "Ahora"}
				</h2>
				<ActivityTag activityId={session.activityId} />
			</div>

			<div className="flex flex-col gap-1">
				<p
					className={`tabular text-[3.5rem] leading-none font-extrabold tracking-[-0.02em] ${
						over
							? "text-stop"
							: paused || scheduled
								? "text-ink-soft"
								: "text-ink"
					}`}
					aria-hidden="true"
				>
					{scheduled
						? minutesText(session.plannedDurationSeconds / 60)
						: countdown(t.remainingMs)}
				</p>
				<p className="sr-only" aria-live="polite">
					{scheduled
						? `Sesión programada de ${minutesText(session.plannedDurationSeconds / 60)}`
						: over
							? `Se pasó ${minutesText(Math.ceil(-t.remainingMs / 60_000))}`
							: `Quedan ${minutesText(Math.ceil(t.remainingMs / 60_000))}`}
				</p>
				<p className={over ? "font-medium text-stop" : "text-ink-soft"}>
					{status}
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<BrickRow
					bricks={bricks}
					perRow={perRow}
					label={`${minutesText(Math.max(0, t.remainingMs) / 60_000)} restantes de ${minutesText(session.plannedDurationSeconds / 60)}`}
				/>
				<p className="text-[0.9375rem] text-ink-soft">
					{scheduled
						? `${minutesText(session.plannedDurationSeconds / 60)} · la programó ${startedBy}`
						: `Lleva ${minutesText(elapsedMinutes)} de ${minutesText(session.plannedDurationSeconds / 60)} · la inició ${startedBy}`}
					{session.overrideId !== null && " · con tiempo extra"}
					{unit !== BRICK_MINUTES && ` · 1 ladrillo = ${unit} min`}
				</p>
			</div>

			{longPause && (
				<p className="text-[#7d1206]">
					Una pausa no gasta tiempo, pero no deja empezar otra sesión. Si ya
					terminó, detenla.
				</p>
			)}

			<div className="grid grid-cols-2 gap-2">
				{scheduled ? (
					<>
						<Button
							variant="primary"
							icon={<Play className="size-5" aria-hidden="true" />}
							busy={commands.start.isPending}
							disabled={busy}
							onClick={() => commands.start.mutate(undefined)}
						>
							Empezar ya
						</Button>
						<Button
							icon={<X className="size-5" aria-hidden="true" />}
							disabled={busy}
							onClick={() => setConfirm("cancel")}
						>
							Cancelar
						</Button>
					</>
				) : (
					<>
						{paused ? (
							<Button
								variant="primary"
								icon={<Play className="size-5" aria-hidden="true" />}
								busy={commands.resume.isPending}
								disabled={busy}
								onClick={() => commands.resume.mutate(undefined)}
							>
								Reanudar
							</Button>
						) : (
							<Button
								variant="pause"
								icon={<Pause className="size-5" aria-hidden="true" />}
								busy={commands.pause.isPending}
								disabled={busy}
								onClick={() => commands.pause.mutate(undefined)}
							>
								Pausar
							</Button>
						)}
						<Button
							variant={over || longPause ? "danger" : "secondary"}
							icon={<Square className="size-4.5" aria-hidden="true" />}
							disabled={busy}
							onClick={() => setConfirm("stop")}
						>
							Detener
						</Button>
					</>
				)}
			</div>

			<ConfirmDialog
				open={confirm === "stop"}
				title={`¿Detener ${name}?`}
				confirmLabel="Detener"
				busy={commands.stop.isPending}
				onClose={() => setConfirm(null)}
				onConfirm={() =>
					commands.stop.mutate(undefined, { onSettled: () => setConfirm(null) })
				}
			>
				Se cuenta el tiempo real que usó: {minutesText(elapsedMinutes)}. No se
				puede deshacer.
			</ConfirmDialog>
			<ConfirmDialog
				open={confirm === "cancel"}
				title="¿Cancelar la sesión programada?"
				confirmLabel="Cancelar sesión"
				busy={commands.cancel.isPending}
				onClose={() => setConfirm(null)}
				onConfirm={() =>
					commands.cancel.mutate(undefined, {
						onSettled: () => setConfirm(null),
					})
				}
			>
				No llegó a empezar, así que no gasta nada de su tiempo.
			</ConfirmDialog>
		</Callout>
	);
}

function rechargeText(balance: Balance, timeZone: string): string {
	if (balance.weeklyRemainingSeconds === 0) {
		return `Se acabó la semana: se recarga el ${dayText(balance.nextWeeklyRechargeAt, timeZone)}.`;
	}
	return `Mañana vuelve a tener ${secondsText(balance.dailyLimitSeconds)}.`;
}

function NothingRunning({ balances }: { balances: readonly Balance[] }) {
	const { child, timeZone } = useParents();
	const name = child?.name ?? "El niño";
	// The bag with the most time left decides what can still be started.
	const best = balances.reduce<Balance | undefined>(
		(top, balance) =>
			top === undefined || balance.availableSeconds > top.availableSeconds
				? balance
				: top,
		undefined,
	);
	const available = best?.availableSeconds ?? 0;
	const exhausted = best !== undefined && available === 0;
	return (
		<Callout
			className="flex flex-col gap-4 p-4 sm:p-5"
			aria-labelledby="now-title"
		>
			<h2 id="now-title" className="text-lg font-semibold">
				Ahora
			</h2>
			<p className="text-ink-soft">
				{best === undefined
					? "Todavía no hay reglas de tiempo. Define los límites para empezar."
					: exhausted
						? `${name} ya usó todo su tiempo de hoy. ${rechargeText(best, timeZone)}`
						: `No hay nada corriendo. ${name} puede usar ${secondsText(available)} más hoy.`}
			</p>
			{best === undefined ? (
				<Link href="/reglas" className={buttonClass("primary")}>
					Definir los límites
				</Link>
			) : exhausted ? (
				<Link href="/sesion" className={buttonClass("secondary")}>
					<CalendarClock className="size-5" aria-hidden="true" />
					Dar tiempo extra
				</Link>
			) : (
				<Link href="/sesion" className={buttonClass("primary")}>
					<Plus className="size-5" aria-hidden="true" />
					Nueva sesión
				</Link>
			)}
		</Callout>
	);
}

export function NowCard({
	live,
	balances,
	policies,
}: {
	live: LiveView["live"];
	balances: readonly Balance[];
	policies: readonly Policy[];
}) {
	if (live === null) {
		return <NothingRunning balances={balances} />;
	}
	return (
		<LiveSession
			key={live.session.id}
			session={live.session}
			policies={policies}
		/>
	);
}

export function isLongPause(live: LiveView["live"], now: number): boolean {
	if (live === null || live.session.status !== "paused") {
		return false;
	}
	const since = pausedSince(live.session);
	return since !== null && now - since >= LONG_PAUSE_MINUTES * 60_000;
}
