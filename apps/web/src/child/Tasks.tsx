// Tareas: the bonus tasks the parents set up, what each one earns (in yellow
// bricks), how many times it still counts this week, and "¡La hice!" to tell
// a parent, with an optional note. Below, this week's reports and how they
// went. Approved minutes join the week, up to the bonus cap, shown on top.
import { Check, Hourglass, MessageCircle, Send, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { PartsBox } from "../components/bricks";
import {
	Button,
	Callout,
	inputClass,
	LoadingBricks,
	Notice,
} from "../components/ui";
import { api, call } from "../lib/api";
import { serverNow } from "../lib/clock";
import { minutesText, relativeDayText, timeText } from "../lib/format";
import {
	useBalance,
	useBonusTasks,
	useHistory,
	usePendingReports,
} from "../lib/queries";
import type { BonusTask, TaskReport } from "../lib/types";
import { useCommand } from "../lib/useCommand";
import { useChild } from "./context";
import { childErrorMessage } from "./errors";
import { BonusMeter } from "./home/Batteries";

const NOTE_MAX = 200;

function TaskCard({
	task,
	pending,
	doneThisWeek,
}: {
	task: BonusTask;
	pending: boolean;
	// Reports this week that count toward its weekly maximum.
	doneThisWeek: number;
}) {
	const titleId = useId();
	const noteId = useId();
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const report = useCommand(
		() =>
			call(
				api["task-reports"].$post({
					json: {
						bonusTaskId: task.id,
						note: note.trim() === "" ? undefined : note.trim(),
					},
				}),
			),
		{
			success: "¡Listo! Mamá o papá la van a revisar.",
			errorText: childErrorMessage,
			onSuccess: () => {
				setOpen(false);
				setNote("");
			},
		},
	);
	const max = task.maxPerWeek;
	const limitReached = max !== null && doneThisWeek >= max;

	return (
		<Callout
			as="li"
			className="flex flex-col gap-3 p-4 sm:p-5"
			aria-labelledby={titleId}
		>
			<div className="flex flex-col gap-1">
				<h3 id={titleId} className="text-xl leading-tight font-semibold">
					{task.name}
				</h3>
				{task.description && (
					<p className="text-ink-soft">{task.description}</p>
				)}
			</div>
			<PartsBox
				minutes={task.rewardMinutes}
				color="var(--color-bonus)"
				label={`Vale ${minutesText(task.rewardMinutes)} de bono`}
			/>
			<p className="text-[0.9375rem] text-ink-soft">
				{max === null
					? "Cuenta todas las veces que la hagas"
					: max === 1
						? `Cuenta una vez por semana${doneThisWeek > 0 ? " · ya la hiciste" : ""}`
						: `Hasta ${max} veces por semana · llevas ${doneThisWeek}`}
			</p>

			{pending ? (
				<p className="flex items-center gap-2 rounded-control bg-sheet-sunk px-3.5 py-3 font-medium">
					<Hourglass className="size-5 shrink-0" aria-hidden="true" />
					Esperando que la revisen
				</p>
			) : limitReached ? (
				<p className="flex items-center gap-2 rounded-control bg-sheet-sunk px-3.5 py-3 text-ink-soft">
					<Check className="size-5 shrink-0" aria-hidden="true" />
					{max === 1
						? "Ya la hiciste esta semana."
						: `Ya la hiciste las ${max} veces de esta semana.`}
				</p>
			) : open ? (
				<form
					className="flex flex-col gap-3 border-t-[1.5px] border-rule pt-3"
					onSubmit={(event) => {
						event.preventDefault();
						report.mutate(undefined);
					}}
				>
					<div className="flex flex-col gap-1.5">
						<label htmlFor={noteId} className="font-medium">
							¿Algo que contar?{" "}
							<span className="font-normal text-ink-soft">(opcional)</span>
						</label>
						<textarea
							id={noteId}
							rows={2}
							maxLength={NOTE_MAX}
							value={note}
							onChange={(event) => setNote(event.target.value)}
							className={`${inputClass} py-3`}
							placeholder="También guardé los juguetes"
						/>
					</div>
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button
							variant="quiet"
							disabled={report.isPending}
							onClick={() => setOpen(false)}
						>
							Volver
						</Button>
						<Button
							type="submit"
							variant="primary"
							icon={<Send className="size-5" aria-hidden="true" />}
							busy={report.isPending}
						>
							Avisar a mamá o papá
						</Button>
					</div>
				</form>
			) : (
				<Button
					icon={<Sparkles className="size-5" aria-hidden="true" />}
					onClick={() => setOpen(true)}
					className="text-lg sm:w-fit"
				>
					¡La hice!
				</Button>
			)}
		</Callout>
	);
}

function ReportItem({
	report,
	taskName,
}: {
	report: TaskReport;
	taskName: string;
}) {
	const { parentName, timeZone } = useChild();
	const who = parentName(report.reviewedByParentId);
	const when = `${relativeDayText(report.reportedAt, serverNow(), timeZone)}, ${timeText(report.reportedAt, timeZone)}`;
	const status =
		report.status === "approved"
			? {
					Icon: Check,
					text: `${who} la aprobó: +${minutesText(report.awardedMinutes ?? 0)} de bono`,
					className: "text-bonus-ink font-medium",
				}
			: report.status === "rejected"
				? {
						Icon: MessageCircle,
						text: `${who} dijo que esta vez no cuenta`,
						className: "text-ink-soft",
					}
				: {
						Icon: Hourglass,
						text: "Esperando que la revisen",
						className: "text-ink-soft",
					};
	return (
		<li
			className={`flex flex-col gap-1 rounded-control border-[1.5px] p-3 ${
				report.status === "approved"
					? "border-[#d9b21f] bg-bonus-tint"
					: "border-rule bg-sheet"
			}`}
		>
			<div className="flex items-baseline justify-between gap-2">
				<p className="font-semibold">{taskName}</p>
				<p className="tabular shrink-0 text-[0.9375rem] text-ink-soft">
					{when}
				</p>
			</div>
			<p
				className={`flex items-center gap-1.5 text-[0.9375rem] ${status.className}`}
			>
				<status.Icon className="size-4 shrink-0" aria-hidden="true" />
				{status.text}
			</p>
			{report.reviewNote && (
				<p className="text-[0.9375rem]">
					«{report.reviewNote}» <span className="text-ink-soft">({who})</span>
				</p>
			)}
		</li>
	);
}

export function Tasks() {
	const { childId } = useChild();
	const tasks = useBonusTasks();
	const pending = usePendingReports();
	const balance = useBalance(childId);
	const waiting = (pending.data?.reports.length ?? 0) > 0;
	const history = useHistory(childId, undefined, { poll: waiting });
	const { refetch } = history;

	// A report was reviewed: show how it went now, not on the next poll.
	const pendingCount = pending.data?.reports.length ?? 0;
	const previous = useRef(pendingCount);
	useEffect(() => {
		if (pendingCount < previous.current) {
			void refetch();
		}
		previous.current = pendingCount;
	}, [pendingCount, refetch]);

	const header = (
		<div className="flex flex-col gap-1">
			<h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.01em]">
				Tareas
			</h1>
			<p className="text-ink-soft">
				Haz una tarea, avísale a mamá o papá y gana minutos para tu semana.
			</p>
		</div>
	);

	if (tasks.data === undefined || pending.data === undefined) {
		const error = tasks.error ?? pending.error;
		return (
			<div className="mx-auto flex max-w-xl flex-col gap-5">
				{header}
				{error ? (
					<Notice tone="error">{childErrorMessage(error)}</Notice>
				) : (
					<LoadingBricks />
				)}
			</div>
		);
	}

	const reports = history.data?.taskReports ?? [];
	const bag =
		balance.data?.balances.find((b) => b.activityId === null) ??
		balance.data?.balances[0];
	const taskName = (id: string) =>
		tasks.data.tasks.find((t) => t.id === id)?.name ?? "Una tarea";

	return (
		<div className="mx-auto flex max-w-xl flex-col gap-5">
			{header}

			{bag !== undefined && bag.bonusCapSeconds > 0 && (
				<Callout className="p-4 sm:p-5">
					<BonusMeter
						earnedSeconds={bag.bonusEarnedSeconds}
						capSeconds={bag.bonusCapSeconds}
						heading="h2"
					/>
					{bag.bonusEarnedSeconds >= bag.bonusCapSeconds && (
						<p className="mt-2 text-[0.9375rem] text-ink-soft">
							Puedes seguir haciendo tareas: mamá o papá las verán igual.
						</p>
					)}
				</Callout>
			)}

			{tasks.data.tasks.length === 0 ? (
				<Callout className="flex flex-col gap-2 p-4 sm:p-5">
					<h2 className="text-xl leading-tight font-semibold">
						Todavía no hay tareas
					</h2>
					<p className="text-ink-soft">
						Pídele a mamá o papá que agreguen algunas para ganar minutos.
					</p>
				</Callout>
			) : (
				<section
					aria-labelledby="catalog-title"
					className="flex flex-col gap-3"
				>
					<h2 id="catalog-title" className="sr-only">
						Tareas que puedes hacer
					</h2>
					<ul className="flex flex-col gap-3">
						{tasks.data.tasks.map((task) => (
							<TaskCard
								key={task.id}
								task={task}
								pending={pending.data.reports.some(
									(r) => r.bonusTaskId === task.id,
								)}
								doneThisWeek={
									reports.filter(
										(r) => r.bonusTaskId === task.id && r.status !== "rejected",
									).length
								}
							/>
						))}
					</ul>
				</section>
			)}

			{reports.length > 0 && (
				<section
					aria-labelledby="reports-title"
					className="flex flex-col gap-3"
				>
					<h2
						id="reports-title"
						className="text-xl leading-tight font-semibold"
					>
						Tus reportes de esta semana
					</h2>
					<ul className="flex flex-col gap-2">
						{reports.map((report) => (
							<ReportItem
								key={report.id}
								report={report}
								taskName={taskName(report.bonusTaskId)}
							/>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
