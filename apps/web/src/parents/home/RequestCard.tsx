// A pending request from the child, as a parts box: what they ask for, in
// bricks, and the answer right there. Approve as asked, adjust (fewer minutes,
// later today, a note) or reject with a note. It expires on its own after 15
// minutes, so the card shows the time left.
import { Check, SlidersHorizontal, X } from "lucide-react";
import { useId, useState } from "react";
import { PartsBox } from "../../components/bricks";
import {
	Button,
	Callout,
	inputClass,
	MinutesStepper,
} from "../../components/ui";
import { activityById, activityLook } from "../../lib/activity";
import { api, call } from "../../lib/api";
import { useServerNow } from "../../lib/clock";
import { countdown, minutesText, timeText } from "../../lib/format";
import type { Balance, ChildRequest } from "../../lib/types";
import { useCommand } from "../../lib/useCommand";
import { useParents } from "../context";
import {
	defaultLater,
	laterIsValid,
	startAtFor,
	type When,
	WhenPicker,
} from "./WhenPicker";

type Mode = "idle" | "adjust" | "reject";

function bagOf(
	balances: readonly Balance[],
	activityId: string,
): Balance | undefined {
	return (
		balances.find((balance) => balance.activityId === activityId) ??
		balances.find((balance) => balance.activityId === null)
	);
}

export function RequestCard({
	request,
	balances,
}: {
	request: ChildRequest;
	balances: readonly Balance[];
}) {
	const { activities, child, household, timeZone } = useParents();
	const now = useServerNow();
	const noteId = useId();
	const titleId = useId();
	const [mode, setMode] = useState<Mode>("idle");
	const activity = activityById(activities, request.activityId);
	const look = activityLook(activity?.code);
	const childName =
		household.children.find((c) => c.id === request.childId)?.name ??
		child?.name ??
		"El niño";
	const extra = request.requestType === "extra_time";

	// A start request cannot go over what is available; extra time brings its
	// own minutes (the override).
	const available = Math.floor(
		(bagOf(balances, request.activityId)?.availableSeconds ?? 0) / 60,
	);
	const max = extra
		? request.requestedMinutes
		: Math.min(request.requestedMinutes, available);
	const fits = max >= request.requestedMinutes;
	const [minutes, setMinutes] = useState(Math.max(1, max));
	const [when, setWhen] = useState<When>({
		mode: "now",
		time: defaultLater(timeZone),
	});
	const [note, setNote] = useState("");

	const expiresIn = Date.parse(request.expiresAt) - now;
	const requestId = request.id;

	const approve = useCommand(
		(input: { minutes: number; when: When; note: string }) =>
			call(
				api.requests[":requestId"].approve.$post({
					param: { requestId },
					json: {
						approvedMinutes: input.minutes,
						startAt: startAtFor(input.when, timeZone),
						note: input.note.trim() === "" ? undefined : input.note.trim(),
					},
				}),
			),
		{
			success: (_result, input) =>
				input.when.mode === "now"
					? `Aprobado: ${minutesText(input.minutes)} de ${activity?.name ?? "tiempo"}, desde ya`
					: `Aprobado para las ${input.when.time}`,
		},
	);
	const reject = useCommand(
		(input: { note: string }) =>
			call(
				api.requests[":requestId"].reject.$post({
					param: { requestId },
					json: {
						note: input.note.trim() === "" ? undefined : input.note.trim(),
					},
				}),
			),
		{
			success: (_result, input) =>
				input.note.trim() === ""
					? "Solicitud rechazada"
					: `Solicitud rechazada: ${childName} verá tu nota`,
		},
	);
	const busy = approve.isPending || reject.isPending;

	return (
		<Callout
			as="article"
			className="flex flex-col gap-4 p-4 sm:p-5"
			aria-labelledby={titleId}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					<h3 id={titleId} className="text-[1.1875rem] leading-snug font-bold">
						{childName} pide {minutesText(request.requestedMinutes)}
						{extra ? " extra" : ""} de {activity?.name ?? "pantalla"}
					</h3>
					<p className="text-[0.9375rem] text-ink-soft">
						{extra ? "Tiempo extra · " : ""}
						pidió a las {timeText(request.createdAt, timeZone)} ·{" "}
						<span className="tabular">
							{expiresIn > 0
								? `expira en ${
										expiresIn > 60_000
											? minutesText(Math.ceil(expiresIn / 60_000))
											: countdown(expiresIn)
									}`
								: "expirando"}
						</span>
					</p>
				</div>
				<span
					className="grid size-10 shrink-0 place-items-center rounded-full text-white"
					style={{ background: look.color }}
					aria-hidden="true"
				>
					<look.Icon className="size-5" />
				</span>
			</div>

			{request.reason && (
				<blockquote className="rounded-control bg-sheet-sunk px-3.5 py-2.5 text-ink">
					«{request.reason}»
				</blockquote>
			)}

			<PartsBox
				minutes={request.requestedMinutes}
				color={look.color}
				label={`${minutesText(request.requestedMinutes)} pedidos`}
			/>

			{!extra && !fits && (
				<p className="text-[0.9375rem] text-ink-soft">
					{available > 0
						? `Solo le quedan ${minutesText(available)}: puedes aprobar hasta esa cantidad.`
						: "Ya no le queda tiempo: no se puede aprobar. Recházala o dale tiempo extra desde Nueva sesión."}
				</p>
			)}

			{mode === "idle" && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr]">
					<Button
						variant="primary"
						className="col-span-2 sm:col-span-1"
						icon={<Check className="size-5" aria-hidden="true" />}
						busy={approve.isPending}
						disabled={busy || max < 1}
						onClick={() =>
							approve.mutate({
								minutes: max,
								when: { ...when, mode: "now" },
								note: "",
							})
						}
					>
						{fits ? "Aprobar" : `Aprobar ${minutesText(max)}`}
					</Button>
					<Button
						icon={<SlidersHorizontal className="size-4.5" aria-hidden="true" />}
						disabled={busy || max < 1}
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

			{mode === "adjust" && (
				<form
					className="flex flex-col gap-4 border-t-[1.5px] border-rule pt-4"
					onSubmit={(event) => {
						event.preventDefault();
						approve.mutate({ minutes, when, note });
					}}
				>
					<div className="flex flex-col gap-1.5">
						<span className="font-medium">Minutos</span>
						<MinutesStepper
							id={`${titleId}-minutes`}
							label="Minutos aprobados"
							value={minutes}
							onChange={setMinutes}
							max={max}
						/>
						<p className="text-[0.9375rem] text-ink-soft">
							Hasta {minutesText(max)}
							{extra
								? ", lo que pidió."
								: fits
									? ", lo que pidió."
									: ", lo que le queda."}
						</p>
					</div>
					<WhenPicker value={when} onChange={setWhen} timeZone={timeZone} />
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
							placeholder="Después de cenar"
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
							variant="primary"
							busy={approve.isPending}
							disabled={
								busy ||
								minutes < 1 ||
								minutes > max ||
								!laterIsValid(when, timeZone)
							}
						>
							{when.mode === "now"
								? `Aprobar ${minutesText(minutes)}`
								: `Aprobar para las ${when.time}`}
						</Button>
					</div>
				</form>
			)}

			{mode === "reject" && (
				<form
					className="flex flex-col gap-4 border-t-[1.5px] border-rule pt-4"
					onSubmit={(event) => {
						event.preventDefault();
						reject.mutate({ note });
					}}
				>
					<div className="flex flex-col gap-1.5">
						<label htmlFor={noteId} className="font-medium">
							Nota para {childName}{" "}
							<span className="font-normal text-ink-soft">(opcional)</span>
						</label>
						<textarea
							id={noteId}
							maxLength={200}
							rows={2}
							value={note}
							onChange={(event) => setNote(event.target.value)}
							className={`${inputClass} py-3`}
							placeholder="Hoy no, mañana sí"
						/>
						<p className="text-[0.9375rem] text-ink-soft">
							Le llega en el aviso.
						</p>
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
							variant="danger"
							busy={reject.isPending}
							disabled={busy}
						>
							Rechazar
						</Button>
					</div>
				</form>
			)}
		</Callout>
	);
}
