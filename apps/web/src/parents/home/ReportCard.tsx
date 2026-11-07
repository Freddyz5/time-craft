// A task the child says they did: approve it with the task's minutes (or
// other), or reject it with a note. Approved minutes join the week of one
// quota as yellow bricks, up to its weekly bonus cap; with several quotas the
// parent picks which one.
import { Check, SlidersHorizontal, X } from "lucide-react";
import { useId, useState } from "react";
import { PartsBox } from "../../components/bricks";
import {
	Button,
	Callout,
	inputClass,
	MinutesStepper,
} from "../../components/ui";
import { activityLook, bagMembers, bagOrder } from "../../lib/activity";
import { api, call } from "../../lib/api";
import { serverNow } from "../../lib/clock";
import {
	minutesText,
	namesText,
	relativeDayText,
	secondsText,
	timeText,
} from "../../lib/format";
import type { Activity, Balance, BonusTask, TaskReport } from "../../lib/types";
import { useCommand } from "../../lib/useCommand";
import { useParents } from "../context";

type Mode = "idle" | "adjust" | "reject";

// A quota the bonus can go to: its balance, the activities that share it
// and how much of its weekly bonus cap is still free.
interface BonusQuota {
	balance: Balance;
	members: Activity[];
	name: string;
	capLeftSeconds: number;
}

function capLeftText(quota: BonusQuota): string {
	return quota.capLeftSeconds === 0
		? "Ya llegó al tope de bonos"
		: `Le faltan ${secondsText(quota.capLeftSeconds)} para el tope`;
}

// Which quota the bonus adds to: one tile per quota, in a tray sunk into the
// plate; the chosen one is an ink tile, like the segmented control.
function QuotaChoice({
	quotas,
	value,
	onChange,
	disabled,
}: {
	quotas: readonly BonusQuota[];
	value: string;
	onChange: (policyId: string) => void;
	disabled: boolean;
}) {
	const name = useId();
	return (
		<fieldset className="flex flex-col gap-1.5" disabled={disabled}>
			<legend className="mb-1.5 font-medium">¿A qué cuota suma?</legend>
			<div className="grid gap-1 rounded-control border-[1.5px] border-rule-strong bg-sheet-sunk p-1 pb-1.5 shadow-[inset_0_2px_0_rgb(0_0_0/0.07)] sm:grid-cols-2">
				{quotas.map((quota) => (
					<label
						key={quota.balance.policyId}
						className="group flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-ink-soft transition-colors hover:text-ink has-checked:bg-ink has-checked:text-on-ink has-checked:shadow-[0_3px_0_var(--color-ink-side)] has-focus-visible:outline-3 has-focus-visible:outline-focus"
					>
						<input
							type="radio"
							name={name}
							value={quota.balance.policyId}
							checked={value === quota.balance.policyId}
							onChange={() => onChange(quota.balance.policyId)}
							className="sr-only"
						/>
						<span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
							{quota.members.map((activity) => {
								const look = activityLook(activity.code);
								return (
									<span
										key={activity.id}
										className="grid size-7 place-items-center rounded-full text-white ring-2 ring-sheet-sunk group-has-checked:ring-ink"
										style={{ background: look.color }}
									>
										<look.Icon className="size-4" />
									</span>
								);
							})}
						</span>
						<span className="flex min-w-0 flex-col">
							<span className="font-bold text-ink group-has-checked:text-on-ink">
								{quota.name}
							</span>
							<span className="tabular text-[0.8125rem] font-semibold">
								{capLeftText(quota)}
							</span>
						</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}

export function ReportCard({
	report,
	task,
	balances,
}: {
	report: TaskReport;
	task: BonusTask | undefined;
	balances: readonly Balance[];
}) {
	const { household, timeZone, activities } = useParents();
	const titleId = useId();
	const noteId = useId();
	const [mode, setMode] = useState<Mode>("idle");
	const reward = task?.rewardMinutes ?? 10;
	const [minutes, setMinutes] = useState(reward);
	const [note, setNote] = useState("");
	const childName =
		household.children.find((c) => c.id === report.childId)?.name ?? "El niño";
	const reportId = report.id;

	const quotas: BonusQuota[] = bagOrder(balances, activities).map((balance) => {
		const members = bagMembers(balance, balances, activities);
		return {
			balance,
			members,
			name: namesText(members.map((a) => a.name)) || "Cuota general",
			capLeftSeconds: Math.max(
				0,
				balance.bonusCapSeconds - balance.bonusEarnedSeconds,
			),
		};
	});
	// The first quota with room for bonuses, unless the parent picks another.
	const [picked, setPicked] = useState<string | null>(null);
	const quota =
		quotas.find((q) => q.balance.policyId === picked) ??
		quotas.find((q) => q.capLeftSeconds > 0) ??
		quotas[0];
	// The api takes an activity of the quota: the bonus follows it.
	const bonusActivityId = quota?.members[0]?.id;
	const quotaSuffix =
		quotas.length > 1 && quota !== undefined ? ` para ${quota.name}` : "";

	const review = useCommand(
		(
			input:
				| {
						decision: "approve";
						awardedMinutes: number;
						bonusActivityId?: string;
						note?: string;
				  }
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
					? `Bono aprobado: +${minutesText(input.awardedMinutes)}${quotaSuffix}`
					: "Reporte rechazado",
		},
	);
	const busy = review.isPending;
	const capLeft = quota === undefined ? null : quota.capLeftSeconds;
	const trimmedNote = note.trim() === "" ? undefined : note.trim();
	const capName = quotas.length > 1 && quota ? ` de ${quota.name}` : "";

	return (
		<Callout
			as="article"
			tone="bonus"
			className="flex flex-col gap-3 p-4 sm:p-5"
			aria-labelledby={titleId}
		>
			<div className="flex flex-col gap-1">
				<h3 id={titleId} className="text-[1.1875rem] leading-snug font-bold">
					{childName} hizo «{task?.name ?? "una tarea"}»
				</h3>
				<p className="text-[0.9375rem] text-bonus-ink">
					Vale {minutesText(reward)} · lo reportó{" "}
					{relativeDayText(report.reportedAt, serverNow(), timeZone)} a las{" "}
					{timeText(report.reportedAt, timeZone)}
				</p>
			</div>
			{report.note && (
				<blockquote className="rounded-control bg-sheet-sunk px-3.5 py-2.5">
					«{report.note}»
				</blockquote>
			)}
			<PartsBox
				minutes={reward}
				color="var(--color-bonus)"
				label={`${minutesText(reward)} de bono`}
			/>
			{quotas.length > 1 && mode !== "reject" && (
				<QuotaChoice
					quotas={quotas}
					value={quota?.balance.policyId ?? ""}
					onChange={setPicked}
					disabled={busy}
				/>
			)}
			{capLeft !== null && capLeft === 0 && (
				<p className="text-[0.9375rem] text-bonus-ink">
					Ya llegó al tope de bonos{capName} de esta semana: aprobarla queda
					registrado, pero no suma más tiempo.
				</p>
			)}
			{capLeft !== null && capLeft > 0 && capLeft < reward * 60 && (
				<p className="text-[0.9375rem] text-bonus-ink">
					Solo faltan {secondsText(capLeft)} para el tope de bonos{capName} de
					la semana.
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
							review.mutate({
								decision: "approve",
								awardedMinutes: reward,
								bonusActivityId,
							})
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
					className="flex flex-col gap-4 border-t-[1.5px] border-bonus-side pt-4"
					onSubmit={(event) => {
						event.preventDefault();
						review.mutate(
							mode === "adjust"
								? {
										decision: "approve",
										awardedMinutes: minutes,
										bonusActivityId,
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
