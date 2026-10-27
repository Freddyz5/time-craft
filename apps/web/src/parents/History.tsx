// Historial: what happened in a week (this one by default, then back week by
// week). Use per activity in bricks, sessions grouped by day, extra time with
// its reason, the requests that were not approved and the task reports.
// Read-only: the api computes every number.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { amountBricks, BrickRow, brickUnit } from "../components/bricks";
import { Callout, LoadingBricks, Notice } from "../components/ui";
import { activityById, activityLook } from "../lib/activity";
import { useServerNow } from "../lib/clock";
import { errorMessage } from "../lib/errors";
import {
	calendarDay,
	dayRangeText,
	dayText,
	minutesText,
	relativeDayText,
	secondsText,
	timeText,
} from "../lib/format";
import { useBonusTasks, useHistory } from "../lib/queries";
import { timing } from "../lib/timer";
import type {
	ChildRequest,
	History as HistoryView,
	Session,
} from "../lib/types";
import { parentName, useParents } from "./context";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Tone = "neutral" | "good" | "warn" | "bad";

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
	const tones: Record<Tone, string> = {
		neutral: "bg-sheet-sunk text-ink-soft",
		good: "bg-balance-tint text-balance-ink",
		warn: "bg-pause-tint text-pause-ink",
		bad: "bg-stop-tint text-stop-ink",
	};
	return (
		<span
			className={`rounded-full px-2 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap ${tones[tone]}`}
		>
			{children}
		</span>
	);
}

function sessionStatus(session: Session): { label: string; tone: Tone } {
	switch (session.status) {
		case "finished":
			return session.endReason === "auto_closed"
				? { label: "Cerrada sola", tone: "bad" }
				: session.endReason === "stopped_early"
					? { label: "Detenida antes", tone: "neutral" }
					: { label: "Completa", tone: "neutral" };
		case "cancelled":
			return { label: "Cancelada", tone: "neutral" };
		case "running":
			return { label: "En curso", tone: "good" };
		case "paused":
			return { label: "En pausa", tone: "warn" };
		default:
			return { label: "Programada", tone: "neutral" };
	}
}

function requestStatus(request: ChildRequest): { label: string; tone: Tone } {
	switch (request.status) {
		case "approved":
			return {
				label: `Aprobada · ${minutesText(request.approvedMinutes ?? 0)}`,
				tone: "good",
			};
		case "rejected":
			return { label: "Rechazada", tone: "bad" };
		case "expired":
			return { label: "Expiró sin respuesta", tone: "warn" };
		case "cancelled":
			return { label: "La canceló", tone: "neutral" };
		default:
			return { label: "Pendiente", tone: "neutral" };
	}
}

function Section({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<Callout className="flex flex-col gap-4 p-4 sm:p-5" aria-labelledby={id}>
			<h2 id={id} className="text-xl leading-tight font-semibold">
				{title}
			</h2>
			{children}
		</Callout>
	);
}

function Usage({ view }: { view: HistoryView }) {
	const { activities } = useParents();
	// Whole minutes per activity, rounded down; the total is their sum, so the
	// numbers on screen always add up.
	const minutesOf = (seconds: number) => Math.floor(seconds / 60);
	const total = view.usageByActivity.reduce(
		(sum, item) => sum + minutesOf(item.consumedSeconds),
		0,
	);
	if (total === 0) {
		return (
			<Section id="usage-title" title="Uso por actividad">
				<p className="text-ink-soft">No usó tiempo de pantalla esta semana.</p>
			</Section>
		);
	}
	const unit = brickUnit(
		Math.max(...view.usageByActivity.map((item) => item.consumedSeconds / 60)),
		30,
	);
	return (
		<Callout
			className="flex flex-col gap-4 p-4 sm:p-5"
			aria-labelledby="usage-title"
		>
			<h2
				id="usage-title"
				className="text-2xl leading-tight font-bold tracking-[-0.01em]"
			>
				<span className="sr-only">Uso por actividad: </span>
				{minutesText(total)} en total
			</h2>
			<ul className="flex flex-col gap-4">
				{view.usageByActivity.map((item) => {
					const activity = activityById(activities, item.activityId);
					const look = activityLook(activity?.code);
					const minutes = item.consumedSeconds / 60;
					return (
						<li key={item.activityId} className="flex flex-col gap-2">
							<div className="flex items-baseline justify-between gap-3">
								<span className="flex items-center gap-2 font-semibold">
									<look.Icon
										className="size-5"
										style={{ color: look.color }}
										aria-hidden="true"
									/>
									{activity?.name ?? "Actividad"}
								</span>
								<span className="tabular text-ink-soft">
									{minutesText(minutesOf(item.consumedSeconds))}
								</span>
							</div>
							<BrickRow
								// Used time: outlines in the activity's colour.
								bricks={amountBricks(minutes, unit, look.color, { used: true })}
								perRow={10}
								gap="tight"
								label={`${activity?.name ?? "Actividad"}: ${secondsText(item.consumedSeconds)}`}
							/>
						</li>
					);
				})}
			</ul>
			<p className="text-[0.9375rem] text-ink-soft">1 ladrillo = {unit} min</p>
		</Callout>
	);
}

function SessionRow({ session, now }: { session: Session; now: number }) {
	const { household, activities, timeZone } = useParents();
	const activity = activityById(activities, session.activityId);
	const look = activityLook(activity?.code);
	const status = sessionStatus(session);
	const start =
		session.startedAt ?? session.scheduledStartAt ?? session.createdAt;
	const consumed =
		session.status === "finished"
			? (session.consumedSeconds ?? 0)
			: session.status === "running" || session.status === "paused"
				? Math.floor(timing(session, now).elapsedMs / 1000)
				: 0;
	const over =
		session.status === "finished" && consumed > session.plannedDurationSeconds;
	const range =
		session.endedAt !== null && session.startedAt !== null
			? `${timeText(session.startedAt, timeZone)}–${timeText(session.endedAt, timeZone)}`
			: timeText(start, timeZone);
	const who = [
		`la inició ${parentName(household, session.startedByParentId)}`,
		session.status === "finished" &&
		session.endReason !== "auto_closed" &&
		session.endedByParentId
			? `la detuvo ${parentName(household, session.endedByParentId)}`
			: null,
		session.status === "cancelled" && session.endedByParentId
			? `la canceló ${parentName(household, session.endedByParentId)}`
			: null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<li className="flex gap-3 border-t-[1.5px] border-rule py-3 first:border-t-0 first:pt-0 last:pb-0">
			<span
				className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-white"
				style={{ background: look.color }}
				aria-hidden="true"
			>
				<look.Icon className="size-4.5" />
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span className="font-semibold">{activity?.name ?? "Actividad"}</span>
					<span className="tabular text-ink-soft">{range}</span>
					<Pill tone={status.tone}>{status.label}</Pill>
					{session.overrideId !== null && <Pill tone="warn">Tiempo extra</Pill>}
				</div>
				<p className="tabular text-[0.9375rem] text-ink-soft">
					{session.status === "cancelled" || session.status === "scheduled"
						? `${minutesText(session.plannedDurationSeconds / 60)} planeados`
						: `Usó ${secondsText(consumed)} de ${minutesText(session.plannedDurationSeconds / 60)}`}
					{over && (
						<span className="font-medium text-stop">
							{" "}
							· se pasó{" "}
							{secondsText(consumed - session.plannedDurationSeconds, true)}
						</span>
					)}
					{session.pauses.length > 0 &&
						` · ${session.pauses.length} ${session.pauses.length === 1 ? "pausa" : "pausas"}`}
				</p>
				<p className="text-[0.9375rem] text-ink-faint">{who}</p>
			</div>
		</li>
	);
}

function Sessions({ view }: { view: HistoryView }) {
	const { timeZone } = useParents();
	const now = useServerNow(60_000);
	if (view.sessions.length === 0) {
		return <p className="text-ink-soft">No hubo sesiones esta semana.</p>;
	}
	const days = new Map<string, Session[]>();
	for (const session of view.sessions) {
		const start =
			session.startedAt ?? session.scheduledStartAt ?? session.createdAt;
		const day = calendarDay(start, timeZone);
		days.set(day, [...(days.get(day) ?? []), session]);
	}
	return (
		<div className="flex flex-col gap-5">
			{[...days].map(([day, sessions]) => {
				const first = sessions[0];
				const relative = first
					? relativeDayText(
							first.startedAt ?? first.scheduledStartAt ?? first.createdAt,
							now,
							timeZone,
						)
					: day;
				const label = relative.charAt(0).toUpperCase() + relative.slice(1);
				return (
					<section key={day} className="flex flex-col gap-2" aria-label={label}>
						<h3 className="font-semibold">{label}</h3>
						<ul className="flex flex-col">
							{sessions.map((session) => (
								<SessionRow key={session.id} session={session} now={now} />
							))}
						</ul>
					</section>
				);
			})}
		</div>
	);
}

function Overrides({ view }: { view: HistoryView }) {
	const { household, timeZone } = useParents();
	if (view.overrides.length === 0) {
		return <p className="text-ink-soft">No se dio tiempo extra esta semana.</p>;
	}
	return (
		<ul className="flex flex-col">
			{view.overrides.map((override) => (
				<li
					key={override.id}
					className="flex flex-col gap-1 border-t-[1.5px] border-rule py-3 first:border-t-0 first:pt-0 last:pb-0"
				>
					<p className="font-semibold">
						+{minutesText(override.extraMinutes)} ·{" "}
						{parentName(household, override.grantedByParentId)}
					</p>
					<p>«{override.reason}»</p>
					<p className="text-[0.9375rem] text-ink-soft">
						{dayText(override.createdAt, timeZone)},{" "}
						{timeText(override.createdAt, timeZone)}
						{override.requestId !== null
							? " · lo pidió el niño"
							: " · lo dio un padre sin pedirlo"}
					</p>
				</li>
			))}
		</ul>
	);
}

function Requests({ view }: { view: HistoryView }) {
	const { activities, household, timeZone } = useParents();
	if (view.requests.length === 0) {
		return <p className="text-ink-soft">No pidió nada esta semana.</p>;
	}
	// Not approved first: those are the ones the parents want to look back at.
	const ordered = [...view.requests].sort(
		(a, b) => Number(a.status === "approved") - Number(b.status === "approved"),
	);
	return (
		<ul className="flex flex-col">
			{ordered.map((request) => {
				const status = requestStatus(request);
				const activity = activityById(activities, request.activityId);
				return (
					<li
						key={request.id}
						className="flex flex-col gap-1 border-t-[1.5px] border-rule py-3 first:border-t-0 first:pt-0 last:pb-0"
					>
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span className="font-semibold">
								{minutesText(request.requestedMinutes)}
								{request.requestType === "extra_time" ? " extra" : ""} de{" "}
								{activity?.name ?? "pantalla"}
							</span>
							<Pill tone={status.tone}>{status.label}</Pill>
						</div>
						{request.reason && <p>«{request.reason}»</p>}
						{request.responseNote && (
							<p className="text-ink-soft">
								Respuesta
								{request.resolvedByParentId
									? ` de ${parentName(household, request.resolvedByParentId)}`
									: ""}
								: «{request.responseNote}»
							</p>
						)}
						<p className="text-[0.9375rem] text-ink-soft">
							{dayText(request.createdAt, timeZone)},{" "}
							{timeText(request.createdAt, timeZone)}
						</p>
					</li>
				);
			})}
		</ul>
	);
}

function Reports({
	view,
	taskName,
}: {
	view: HistoryView;
	taskName: (id: string) => string;
}) {
	const { household, timeZone } = useParents();
	if (view.taskReports.length === 0) {
		return <p className="text-ink-soft">No reportó tareas esta semana.</p>;
	}
	return (
		<ul className="flex flex-col">
			{view.taskReports.map((report) => (
				<li
					key={report.id}
					className="flex flex-col gap-1 border-t-[1.5px] border-rule py-3 first:border-t-0 first:pt-0 last:pb-0"
				>
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span className="font-semibold">
							{taskName(report.bonusTaskId)}
						</span>
						<Pill
							tone={
								report.status === "approved"
									? "good"
									: report.status === "rejected"
										? "bad"
										: "neutral"
							}
						>
							{report.status === "approved"
								? `+${minutesText(report.awardedMinutes ?? 0)}`
								: report.status === "rejected"
									? "Rechazada"
									: "Por revisar"}
						</Pill>
					</div>
					{report.reviewNote && (
						<p className="text-ink-soft">
							{report.reviewedByParentId
								? `${parentName(household, report.reviewedByParentId)}: `
								: ""}
							«{report.reviewNote}»
						</p>
					)}
					<p className="text-[0.9375rem] text-ink-soft">
						{dayText(report.reportedAt, timeZone)},{" "}
						{timeText(report.reportedAt, timeZone)}
					</p>
				</li>
			))}
		</ul>
	);
}

export function History() {
	const { child, timeZone } = useParents();
	// 0 = this week; 1 = last week…
	const [weeksBack, setWeeksBack] = useState(0);
	const current = useHistory(child?.id);
	const currentStart = current.data
		? Date.parse(current.data.period.start)
		: null;
	const period =
		weeksBack === 0 || currentStart === null
			? undefined
			: {
					from: new Date(currentStart - weeksBack * WEEK_MS).toISOString(),
					to: new Date(currentStart - (weeksBack - 1) * WEEK_MS).toISOString(),
				};
	const past = useHistory(period === undefined ? undefined : child?.id, period);
	const query = weeksBack === 0 ? current : past;
	const view = query.data;
	// The api's history includes bonus tasks by id; names come from the catalog.
	const tasks = useBonusTasksNames();

	const rangeLabel = view
		? dayRangeText(view.period.start, Date.parse(view.period.end) - 1, timeZone)
		: "";

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-5">
			<div className="flex flex-col gap-3">
				<h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.01em]">
					Historial
				</h1>
				<div className="plate flex items-center justify-between gap-2 p-1.5">
					<button
						type="button"
						onClick={() => setWeeksBack((weeks) => weeks + 1)}
						disabled={currentStart === null || weeksBack >= 12}
						aria-label="Semana anterior"
						className="grid size-11 place-items-center rounded-control hover:bg-sheet-sunk disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
					>
						<ChevronLeft className="size-5" aria-hidden="true" />
					</button>
					<p className="text-center" aria-live="polite">
						<span className="block font-semibold">
							{weeksBack === 0
								? "Esta semana"
								: weeksBack === 1
									? "La semana pasada"
									: `Hace ${weeksBack} semanas`}
						</span>
						<span className="block text-[0.9375rem] text-ink-soft">
							{rangeLabel}
						</span>
					</p>
					<button
						type="button"
						onClick={() => setWeeksBack((weeks) => Math.max(0, weeks - 1))}
						disabled={weeksBack === 0}
						aria-label="Semana siguiente"
						className="grid size-11 place-items-center rounded-control hover:bg-sheet-sunk disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
					>
						<ChevronRight className="size-5" aria-hidden="true" />
					</button>
				</div>
			</div>

			{child === undefined ? (
				<Notice>
					Todavía no hay cuenta del niño, así que no hay historial.
				</Notice>
			) : view === undefined ? (
				query.error ? (
					<Notice tone="error">{errorMessage(query.error)}</Notice>
				) : (
					<LoadingBricks />
				)
			) : (
				<div
					className={`flex flex-col gap-5 transition-opacity ${query.isPlaceholderData ? "opacity-60" : ""}`}
				>
					<Usage view={view} />
					<Section id="sessions-title" title="Sesiones">
						<Sessions view={view} />
					</Section>
					<Section id="overrides-title" title="Tiempo extra">
						<Overrides view={view} />
					</Section>
					<Section id="requests-title" title="Solicitudes">
						<Requests view={view} />
					</Section>
					<Section id="reports-title" title="Tareas reportadas">
						<Reports view={view} taskName={tasks} />
					</Section>
				</div>
			)}
		</div>
	);
}

function useBonusTasksNames(): (id: string) => string {
	const tasks = useBonusTasks();
	return (id) =>
		tasks.data?.tasks.find((task) => task.id === id)?.name ?? "Tarea";
}
