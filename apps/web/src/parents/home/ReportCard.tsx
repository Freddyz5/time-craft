// A task the child says they did: approve it with the task's minutes (or
// other), or reject it with a note. Approved minutes join the week as yellow
// bricks, up to the weekly bonus cap.
import { Check, SlidersHorizontal, X } from "lucide-react";
import { useId, useState } from "react";
import { PartsBox } from "../../components/bricks";
import {
	Button,
	Callout,
	inputClass,
	MinutesStepper,
} from "../../components/ui";
import { api, call } from "../../lib/api";
import { serverNow } from "../../lib/clock";
import {
	minutesText,
	relativeDayText,
	secondsText,
	timeText,
} from "../../lib/format";
import type { Balance, BonusTask, TaskReport } from "../../lib/types";
import { useParents } from "../context";
import { useCommand } from "../useCommand";

type Mode = "idle" | "adjust" | "reject";

export function ReportCard({
	report,
	task,
	globalBalance,
}: {
	report: TaskReport;
	task: BonusTask | undefined;
	globalBalance: Balance | undefined;
}) {
	const { household, timeZone } = useParents();
	const titleId = useId();
	const noteId = useId();
	const [mode, setMode] = useState<Mode>("idle");
	const reward = task?.rewardMinutes ?? 10;
	const [minutes, setMinutes] = useState(reward);
	const [note, setNote] = useState("");
	const childName =
		household.children.find((c) => c.id === report.childId)?.name ?? "El niño";
	const reportId = report.id;

	const review = useCommand(
		(
			input:
				| { decision: "approve"; awardedMinutes: number; note?: string }
				| { decision: "reject"; note?: string },
		) =>
			call(
				api["task-reports"][":reportId"].review.$post({
					param: { reportId },
					json: input,
				}),
			),
		{
			success: (_result, input) =>
				input.decision === "approve"
					? `Bono aprobado: +${minutesText(input.awardedMinutes)}`
					: "Reporte rechazado",
		},
	);
	const busy = review.isPending;
	const capLeft =
		globalBalance === undefined
			? null
			: Math.max(
					0,
					globalBalance.bonusCapSeconds - globalBalance.bonusEarnedSeconds,
				);
	const trimmedNote = note.trim() === "" ? undefined : note.trim();

	return (
		<Callout
			as="article"
			tone="bonus"
			className="flex flex-col gap-3 p-4 sm:p-5"
			aria-labelledby={titleId}
		>
			<div className="flex flex-col gap-1">
				<h3 id={titleId} className="text-lg leading-snug font-semibold">
					{childName} hizo «{task?.name ?? "una tarea"}»
				</h3>
				<p className="text-[0.9375rem] text-bonus-ink">
					Vale {minutesText(reward)} · lo reportó{" "}
					{relativeDayText(report.reportedAt, serverNow(), timeZone)} a las{" "}
					{timeText(report.reportedAt, timeZone)}
				</p>
			</div>
			{report.note && (
				<blockquote className="rounded-control bg-sheet px-3.5 py-2.5">
					«{report.note}»
				</blockquote>
			)}
			<PartsBox
				minutes={reward}
				color="var(--color-bonus)"
				label={`${minutesText(reward)} de bono`}
			/>
			{capLeft !== null && capLeft === 0 && (
				<p className="text-[0.9375rem] text-bonus-ink">
					Ya llegó al tope de bonos de esta semana: aprobarla queda registrado,
					pero no suma más tiempo.
				</p>
			)}
			{capLeft !== null && capLeft > 0 && capLeft < reward * 60 && (
				<p className="text-[0.9375rem] text-bonus-ink">
					Solo faltan {secondsText(capLeft)} para el tope de bonos de la semana.
				</p>
			)}

			{mode === "idle" && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr]">
					<Button
						variant="primary"
						className="col-span-2 sm:col-span-1"
						icon={<Check className="size-5" aria-hidden="true" />}
						busy={busy}
						onClick={() =>
							review.mutate({ decision: "approve", awardedMinutes: reward })
						}
					>
						Aprobar +{minutesText(reward)}
					</Button>
					<Button
						icon={<SlidersHorizontal className="size-4.5" aria-hidden="true" />}
						disabled={busy}
						onClick={() => setMode("adjust")}
					>
						Ajustar
					</Button>
					<Button
						variant="quiet"
						icon={<X className="size-5" aria-hidden="true" />}
						disabled={busy}
						onClick={() => setMode("reject")}
					>
						Rechazar
					</Button>
				</div>
			)}

			{mode !== "idle" && (
				<form
					className="flex flex-col gap-4 border-t-[1.5px] border-[#d9b21f] pt-4"
					onSubmit={(event) => {
						event.preventDefault();
						review.mutate(
							mode === "adjust"
								? {
										decision: "approve",
										awardedMinutes: minutes,
										note: trimmedNote,
									}
								: { decision: "reject", note: trimmedNote },
						);
					}}
				>
					{mode === "adjust" && (
						<div className="flex flex-col gap-1.5">
							<span className="font-medium">Minutos de bono</span>
							<MinutesStepper
								id={`${titleId}-minutes`}
								label="Minutos de bono"
								value={minutes}
								onChange={setMinutes}
								max={240}
							/>
						</div>
					)}
					<div className="flex flex-col gap-1.5">
						<label htmlFor={noteId} className="font-medium">
							Nota para {childName}{" "}
							<span className="font-normal text-ink-soft">(opcional)</span>
						</label>
						<input
							id={noteId}
							maxLength={200}
							value={note}
							onChange={(event) => setNote(event.target.value)}
							className={inputClass}
							placeholder={
								mode === "reject" ? "Falta guardar la ropa" : "¡Quedó muy bien!"
							}
						/>
					</div>
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button
							variant="quiet"
							disabled={busy}
							onClick={() => setMode("idle")}
						>
							Volver
						</Button>
						<Button
							type="submit"
							variant={mode === "reject" ? "danger" : "primary"}
							busy={busy}
							disabled={mode === "adjust" && minutes < 1}
						>
							{mode === "reject"
								? "Rechazar"
								: `Aprobar +${minutesText(minutes)}`}
						</Button>
					</div>
				</form>
			)}
		</Callout>
	);
}
