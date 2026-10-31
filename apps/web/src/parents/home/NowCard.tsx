// "Ahora": the child's open session (running, paused or scheduled) with its
// countdown and controls, or what can be started when there is none. While
// it runs, the plate takes the activity's colour and the countdown sits on a
// printed tile. The countdown runs on the server's clock; the tab rings at
// the warning and at the end.
import { CalendarClock, Pause, Play, Plus, Square, X } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { Link } from "wouter";
import {
	BRICK_MINUTES,
	BrickTower,
	bricksFor,
	brickUnit,
	overrunBricks,
} from "../../components/bricks";
import { useToast } from "../../components/toast";
import {
	Button,
	buttonClass,
	Callout,
	ConfirmDialog,
} from "../../components/ui";
import { activityById, activityLook, bagFor } from "../../lib/activity";
import { type AlarmKind, useSessionAlarm } from "../../lib/alarm";
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
import { useCommand } from "../../lib/useCommand";
import { parentName, useParents } from "../context";

// From here on a pause counts as forgotten and the card asks to close it.
export const LONG_PAUSE_MINUTES = 30;

function ActivityTag({
	activityId,
	onPlate = false,
}: {
	activityId: string;
	// On the activity's own plate the tag turns white.
	onPlate?: boolean;
}) {
	const { activities } = useParents();
	const activity = activityById(activities, activityId);
	const look = activityLook(activity?.code);
	return (
		<span
			className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold text-white"
			style={
				onPlate
					? { background: "#ffffff", color: look.plate.face }
					: { background: look.color }
			}
		>
			<look.Icon className="size-4" aria-hidden="true" />
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
	policies,
}: {
	session: Session;
	policies: readonly Policy[];
}) {
	const { household, activities, timeZone, child } = useParents();
	const toast = useToast();
	const now = useServerNow();
	const [confirm, setConfirm] = useState<"stop" | "cancel" | null>(null);
	const activity = activityById(activities, session.activityId);
	const look = activityLook(activity?.code);
	const name = activity?.name ?? "La sesión";
	const commands = useSessionCommands(session, name);
	const t = timing(session, now);
	const warningMinutes =
		bagFor(policies, session.activityId)?.warningMinutes ?? 0;

	useSessionAlarm(
		{ sessionId: session.id, endsAtMs: t.endsAtMs, warningMinutes },
		(kind: AlarmKind) => {
			const words =
				kind === "warning"
					? {
							title: `Quedan ${warningMinutes} min`,
							body: `${name} de ${child?.name ?? "el niño"} está por terminar.`,
						}
					: {
							title: "Se acabó el tiempo",
							body: `Terminó ${name} de ${child?.name ?? "el niño"}. Detén la sesión cuando apague.`,
						};
			toast.show("alarm", words.title, words.body);
			return words;
		},
	);

	const paused = session.status === "paused";
	const scheduled = session.status === "scheduled";
	const over = !scheduled && t.remainingMs < 0;
	const pauseStart = pausedSince(session);
	const pausedMinutes =
		pauseStart === null ? 0 : Math.floor((now - pauseStart) / 60_000);
	const longPause = paused && pausedMinutes >= LONG_PAUSE_MINUTES;
	// Running on time: the plate is the activity's, its bricks white plastic.
	const running = !scheduled && !paused && !over;
	const soft = running ? "text-white/85" : "text-ink-soft";
	const { bricks, unit } = sessionBricks(
		session,
		scheduled ? session.plannedDurationSeconds * 1000 : t.remainingMs,
		running ? "#ffffff" : look.color,
		running ? "rgb(255 255 255 / 0.6)" : undefined,
	);
	const busy = Object.values(commands).some((command) => command.isPending);
	const startedBy = parentName(household, session.startedByParentId);
	// Minutes round down, as the countdown does, so the numbers add up.
	const elapsedMinutes = Math.floor(t.elapsedMs / 60_000);

	let status: string;
	if (scheduled) {
		const at = session.scheduledStartAt ?? "";
		const inMinutes = Math.max(0, Math.ceil((Date.parse(at) - now) / 60_000));
		status = `Empieza en ${minutesText(inMinutes)} · ${minutesText(session.plannedDurationSeconds / 60)} de ${name}`;
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
					className={`text-[1.375rem] leading-tight font-bold ${longPause ? "text-pause-ink" : ""}`}
				>
					{longPause
						? `Lleva ${minutesText(pausedMinutes)} en pausa`
						: scheduled
							? "Más tarde"
							: "Ahora"}
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
					<p
						className={`tabular pt-1 font-display text-[4.5rem] leading-none font-extrabold tracking-[-0.02em] ${
							running ? "text-white" : over ? "text-stop" : "text-ink-soft"
						}`}
						aria-hidden="true"
					>
						{scheduled
							? timeText(session.scheduledStartAt ?? now, timeZone)
							: countdown(t.remainingMs)}
					</p>
					<BrickTower
						bricks={bricks}
						label={`${minutesText(Math.max(0, t.remainingMs) / 60_000)} restantes de ${minutesText(session.plannedDurationSeconds / 60)}`}
					/>
				</div>
				<p className="sr-only" aria-live="polite">
					{scheduled
						? `Empieza a las ${timeText(session.scheduledStartAt ?? now, timeZone)}`
						: over
							? `Se pasó ${minutesText(Math.ceil(-t.remainingMs / 60_000))}`
							: `Quedan ${minutesText(Math.ceil(t.remainingMs / 60_000))}`}
				</p>
				<p className={over ? "font-semibold text-stop" : soft}>{status}</p>
				<p className={`text-[0.9375rem] ${soft}`}>
					{scheduled
						? `La programó ${startedBy}`
						: `Lleva ${minutesText(elapsedMinutes)} de ${minutesText(session.plannedDurationSeconds / 60)} · la inició ${startedBy}`}
					{session.overrideId !== null && " · con tiempo extra"}
					{unit !== BRICK_MINUTES && ` · 1 ladrillo = ${unit} min`}
				</p>
			</div>

			{longPause && (
				<p className="text-pause-ink">
					Una pausa no gasta tiempo, pero no deja empezar otra sesión. Si ya
					terminó, detenla.
				</p>
			)}

			<div className="grid grid-cols-2 gap-2 [&_button]:whitespace-nowrap [&_button]:px-3">
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
								// Past its end, stopping is the main move; pausing stays at hand.
								variant={over ? "secondary" : "pause"}
								icon={<Pause className="size-5" aria-hidden="true" />}
								busy={commands.pause.isPending}
								disabled={busy}
								onClick={() => commands.pause.mutate(undefined)}
							>
								Pausar
							</Button>
						)}
						<Button
							variant={
								over || longPause ? "danger" : running ? "light" : "secondary"
							}
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

function NothingRunning({
	balances,
	quiet,
}: {
	balances: readonly Balance[];
	// A request is waiting above: answering it is the main move.
	quiet: boolean;
}) {
	const { child, timeZone, activeActivities } = useParents();
	const name = child?.name ?? "El niño";
	// What each activity can still use (its own bag, or the general one).
	const perActivity = activeActivities.map((activity) => ({
		activity,
		seconds: bagFor(balances, activity.id)?.availableSeconds ?? 0,
	}));
	const best = balances.reduce<Balance | undefined>(
		(top, balance) =>
			top === undefined || balance.availableSeconds > top.availableSeconds
				? balance
				: top,
		undefined,
	);
	const several = balances.length > 1;
	const exhausted = best !== undefined && best.availableSeconds === 0;
	return (
		<Callout
			className="flex flex-col gap-4 p-4 sm:p-5"
			aria-labelledby="now-title"
		>
			<h2 id="now-title" className="text-[1.375rem] leading-tight font-bold">
				Ahora
			</h2>
			<p className="text-ink-soft">
				{best === undefined
					? "Todavía no hay reglas de tiempo. Define los límites para empezar."
					: exhausted
						? `${name} ya usó todo su tiempo de hoy. ${rechargeText(best, timeZone)}`
						: several
							? `No hay nada corriendo. Hoy le quedan: ${perActivity
									.map(
										({ activity, seconds }) =>
											`${activity.name} ${secondsText(seconds)}`,
									)
									.join(" · ")}.`
							: `No hay nada corriendo. ${name} puede usar ${secondsText(best.availableSeconds)} más hoy.`}
			</p>
			{best === undefined ? (
				<Link href="/reglas" className={buttonClass("primary")}>
					Definir los límites
				</Link>
			) : (
				// The desktop rail always carries "Nueva sesión".
				<Link
					href="/sesion"
					className={`${buttonClass(exhausted || quiet ? "secondary" : "primary")} lg:hidden`}
				>
					{exhausted ? (
						<CalendarClock className="size-5" aria-hidden="true" />
					) : (
						<Plus className="size-5" aria-hidden="true" />
					)}
					{exhausted ? "Dar tiempo extra" : "Nueva sesión"}
				</Link>
			)}
		</Callout>
	);
}

export function NowCard({
	live,
	balances,
	policies,
	quiet = false,
}: {
	live: LiveView["live"];
	balances: readonly Balance[];
	policies: readonly Policy[];
	quiet?: boolean;
}) {
	if (live === null) {
		return <NothingRunning balances={balances} quiet={quiet} />;
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
