// Nueva sesión: a parent starts one without a request, now or later today.
// Three numbered steps: activity, minutes (never more than its bag has left),
// when. With the bag empty the flow becomes extra time (an override), which
// always needs a reason and is kept in the history.
import { ArrowLeft, CalendarClock, Play } from "lucide-react";
import { useId, useState } from "react";
import { Link, useLocation } from "wouter";
import { AmountBricks } from "../components/bricks";
import { StepTitle } from "../components/StepTitle";
import {
	Button,
	buttonClass,
	Callout,
	inputClass,
	LoadingBricks,
	MinutesStepper,
	Notice,
} from "../components/ui";
import { activityLook } from "../lib/activity";
import { api, call } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { minutesText, secondsText } from "../lib/format";
import { useBalance, useLiveSession } from "../lib/queries";
import type { Balance } from "../lib/types";
import { useCommand } from "../lib/useCommand";
import { useParents } from "./context";
import {
	defaultLater,
	laterIsValid,
	startAtFor,
	type When,
	WhenPicker,
} from "./home/WhenPicker";

const PRESETS = [15, 30, 45, 60];
const MAX_EXTRA_MINUTES = 240;

function bagOf(
	balances: readonly Balance[],
	activityId: string,
): Balance | undefined {
	return (
		balances.find((balance) => balance.activityId === activityId) ??
		balances.find((balance) => balance.activityId === null)
	);
}

export function NewSession() {
	const { child, activeActivities, timeZone } = useParents();
	const [, navigate] = useLocation();
	const childId = child?.id;
	const live = useLiveSession(childId);
	const balance = useBalance(childId);
	const ids = {
		activity: useId(),
		minutes: useId(),
		when: useId(),
		reason: useId(),
	};

	const [activityId, setActivityId] = useState<string | null>(null);
	const [minutes, setMinutes] = useState(30);
	const [reason, setReason] = useState("");
	const [when, setWhen] = useState<When>({
		mode: "now",
		time: defaultLater(timeZone),
	});

	const balances = balance.data?.balances ?? [];
	const chosenId = activityId ?? activeActivities[0]?.id ?? null;
	const chosen = activeActivities.find((a) => a.id === chosenId);
	const bag = chosenId === null ? undefined : bagOf(balances, chosenId);
	const available = Math.floor((bag?.availableSeconds ?? 0) / 60);
	// Extra time only once the bag is truly empty (the api checks the same).
	const extra = bag !== undefined && bag.availableSeconds === 0;
	const max = extra ? MAX_EXTRA_MINUTES : available;
	const value = Math.min(minutes, Math.max(1, max));
	const look = activityLook(chosen?.code);

	const start = useCommand(
		() => {
			const common = {
				childId: childId ?? "",
				activityId: chosenId ?? "",
				startAt: startAtFor(when, timeZone),
			};
			return extra
				? call(
						api.overrides.$post({
							json: { ...common, extraMinutes: value, reason: reason.trim() },
						}),
					)
				: call(api.sessions.$post({ json: { ...common, minutes: value } }));
		},
		{
			success: () =>
				`${extra ? "Tiempo extra: " : ""}${minutesText(value)} de ${chosen?.name ?? "pantalla"}${
					when.mode === "now" ? ", desde ya" : `, a las ${when.time}`
				}`,
			onSuccess: () => navigate("/"),
		},
	);

	if (child === undefined) {
		return (
			<div className="mx-auto max-w-2xl">
				<Notice
					action={
						<Link href="/cuentas" className={buttonClass("primary", "sm")}>
							Crear la cuenta
						</Link>
					}
				>
					Primero crea la cuenta del niño.
				</Notice>
			</div>
		);
	}

	const header = (
		<div className="flex flex-col gap-2">
			<Link
				href="/"
				className="inline-flex w-fit items-center gap-1.5 rounded-control py-1 font-medium text-ink-soft no-underline hover:text-ink"
			>
				<ArrowLeft className="size-4.5" aria-hidden="true" />
				Inicio
			</Link>
			<h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.01em]">
				Nueva sesión
			</h1>
			<p className="text-ink-soft">
				Para {child.name}, sin esperar a que la pida.
			</p>
		</div>
	);

	if (live.data === undefined || balance.data === undefined) {
		const error = live.error ?? balance.error;
		return (
			<div className="mx-auto flex max-w-2xl flex-col gap-5">
				{header}
				{error ? (
					<Notice tone="error">{errorMessage(error)}</Notice>
				) : (
					<LoadingBricks />
				)}
			</div>
		);
	}

	if (live.data.live !== null) {
		const status = live.data.live.session.status;
		return (
			<div className="mx-auto flex max-w-2xl flex-col gap-5">
				{header}
				<Callout className="flex flex-col items-start gap-3 p-5">
					<h2 className="text-xl leading-tight font-semibold">
						{status === "scheduled"
							? "Ya hay una sesión programada"
							: status === "paused"
								? "Hay una sesión en pausa"
								: "Ya hay una sesión corriendo"}
					</h2>
					<p className="text-ink-soft">
						Solo puede haber una a la vez. Termínala o cancélala desde Inicio
						para empezar otra.
					</p>
					<Link href="/" className={buttonClass("primary")}>
						Ir a Inicio
					</Link>
				</Callout>
			</div>
		);
	}

	if (balances.length === 0) {
		return (
			<div className="mx-auto flex max-w-2xl flex-col gap-5">
				{header}
				<Notice
					action={
						<Link href="/reglas" className={buttonClass("primary", "sm")}>
							Ir a Reglas
						</Link>
					}
				>
					Todavía no hay límites de tiempo: defínelos antes de empezar una
					sesión.
				</Notice>
			</div>
		);
	}

	const reasonMissing = extra && reason.trim() === "";
	// At most four choices: up to three presets under the cap, plus "Todo".
	const showAll = !extra && max > 0 && !PRESETS.includes(max);
	const presets = PRESETS.filter((preset) => preset <= max).slice(
		0,
		showAll ? 3 : 4,
	);

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-5">
			{header}

			<form
				className="flex flex-col gap-5"
				onSubmit={(event) => {
					event.preventDefault();
					start.mutate(undefined);
				}}
			>
				<Callout
					className="flex flex-col gap-4 p-4 sm:p-5"
					aria-labelledby={ids.activity}
				>
					<StepTitle number={1} id={ids.activity}>
						Actividad
					</StepTitle>
					<fieldset className="grid grid-cols-2 gap-2">
						<legend className="sr-only">Actividad</legend>
						{activeActivities.map((activity) => {
							const activityLookItem = activityLook(activity.code);
							const left = Math.floor(
								(bagOf(balances, activity.id)?.availableSeconds ?? 0) / 60,
							);
							return (
								<label
									key={activity.id}
									className="flex cursor-pointer flex-col gap-2 rounded-control border-[1.5px] border-rule-strong bg-sheet p-3 transition-colors hover:bg-sheet-sunk has-checked:border-ink has-checked:bg-sheet has-checked:shadow-[inset_0_0_0_1.5px_var(--color-ink)] has-focus-visible:outline-3 has-focus-visible:outline-focus"
								>
									<input
										type="radio"
										name="activity"
										value={activity.id}
										checked={chosenId === activity.id}
										onChange={() => setActivityId(activity.id)}
										className="sr-only"
									/>
									<span
										className="grid size-10 place-items-center rounded-full text-white"
										style={{ background: activityLookItem.color }}
										aria-hidden="true"
									>
										<activityLookItem.Icon className="size-5" />
									</span>
									<span className="font-semibold">{activity.name}</span>
									<span className="text-[0.9375rem] text-ink-soft">
										{left > 0
											? `${minutesText(left)} por usar`
											: "Sin tiempo hoy"}
									</span>
								</label>
							);
						})}
					</fieldset>
				</Callout>

				<Callout
					className="flex flex-col gap-4 p-4 sm:p-5"
					aria-labelledby={ids.minutes}
				>
					<StepTitle
						number={2}
						id={ids.minutes}
						hint={
							extra
								? `No le queda tiempo de ${chosen?.name ?? "pantalla"}. Puedes darle tiempo extra: queda registrado con su motivo.`
								: `Le quedan ${secondsText(bag?.availableSeconds ?? 0)} hoy. Cuando se le acabe, aquí mismo podrás darle tiempo extra.`
						}
					>
						{extra ? "Tiempo extra" : "Minutos"}
					</StepTitle>
					<fieldset className="flex flex-wrap gap-2">
						<legend className="sr-only">Atajos de minutos</legend>
						{presets.map((preset) => (
							<button
								key={preset}
								type="button"
								aria-pressed={value === preset}
								onClick={() => setMinutes(preset)}
								className="tabular min-h-10 rounded-full border-[1.5px] border-rule-strong bg-sheet px-4 font-medium hover:bg-sheet-sunk aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-on-ink"
							>
								{preset} min
							</button>
						))}
						{showAll && (
							<button
								type="button"
								aria-pressed={value === max}
								onClick={() => setMinutes(max)}
								className="tabular min-h-10 rounded-full border-[1.5px] border-rule-strong bg-sheet px-4 font-medium hover:bg-sheet-sunk aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-on-ink"
							>
								Todo: {max} min
							</button>
						)}
					</fieldset>
					<MinutesStepper
						id={`${ids.minutes}-input`}
						label={extra ? "Minutos extra" : "Minutos"}
						value={value}
						onChange={setMinutes}
						max={Math.max(1, max)}
					/>
					<AmountBricks
						minutes={value}
						color={look.color}
						label={`${minutesText(value)} en ladrillos`}
					/>
					{extra && (
						<div className="flex flex-col gap-1.5">
							<label htmlFor={ids.reason} className="font-medium">
								Motivo
							</label>
							<textarea
								id={ids.reason}
								rows={2}
								maxLength={500}
								required
								value={reason}
								onChange={(event) => setReason(event.target.value)}
								className={`${inputClass} py-3`}
								placeholder="Terminó la tarea antes y le prometimos una partida"
							/>
							<p className="text-[0.9375rem] text-ink-soft">
								Lo ven los dos padres en el historial.
							</p>
						</div>
					)}
				</Callout>

				<Callout
					className="flex flex-col gap-4 p-4 sm:p-5"
					aria-labelledby={ids.when}
				>
					<StepTitle number={3} id={ids.when}>
						¿Cuándo empieza?
					</StepTitle>
					<WhenPicker value={when} onChange={setWhen} timeZone={timeZone} />
				</Callout>

				<Button
					type="submit"
					variant="primary"
					block
					icon={
						when.mode === "now" ? (
							<Play className="size-5" aria-hidden="true" />
						) : (
							<CalendarClock className="size-5" aria-hidden="true" />
						)
					}
					busy={start.isPending}
					disabled={
						chosenId === null ||
						max < 1 ||
						reasonMissing ||
						!laterIsValid(when, timeZone)
					}
				>
					{when.mode === "now"
						? `${extra ? "Dar" : "Empezar"} ${minutesText(value)} de ${chosen?.name ?? "pantalla"}`
						: `Programar para las ${when.time}`}
				</Button>
			</form>
		</div>
	);
}
