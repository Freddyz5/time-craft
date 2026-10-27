// Pedir: the child asks a parent for time. Numbered steps: 1 the activity,
// 2 how much (bricks, never more than what is left of its bag), and, when
// the time is used up, 3 why (extra time always carries a reason). While a
// request waits, it shows here with the way to cancel it; while a session is
// open, nothing can be asked. After a "no" the form waits folded behind
// "Pedir otra cosa", so a new request is a choice, not a reflex. Below,
// today's requests and their answers.
import { Check, CircleHelp, Plus, Send } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Link } from "wouter";
import { StepTitle } from "../components/StepTitle";
import {
	Button,
	buttonClass,
	Callout,
	inputClass,
	LoadingBricks,
	Notice,
} from "../components/ui";
import { activityLook, bagFor } from "../lib/activity";
import { api, call } from "../lib/api";
import { minutesText, secondsText } from "../lib/format";
import { useBalance, useLiveSession } from "../lib/queries";
import { useCommand } from "../lib/useCommand";
import { BrickPicker } from "./ask/BrickPicker";
import { useChild } from "./context";
import { childErrorMessage } from "./errors";
import {
	AnswerAnnouncer,
	AnswerCard,
	PendingCard,
	TodayList,
	useMyRequests,
} from "./requests";

// Extra time: up to six bricks; a parent may give less.
const EXTRA_OPTIONS = [10, 20, 30, 40, 50, 60];
const DEFAULT_MINUTES = 30;
const REASON_MAX = 500;
// Reasons a child can tap instead of typing (and then edit).
const REASONS = [
	"Quiero terminar lo que empecé",
	"Estoy jugando con alguien",
	"Ya hice todos mis deberes",
];
// The extra-time reason survives a trip to another tab.
const DRAFT_KEY = "timecraft:ask-reason";

function readDraft(): string {
	try {
		return window.sessionStorage.getItem(DRAFT_KEY) ?? "";
	} catch {
		return "";
	}
}

function saveDraft(text: string): void {
	try {
		if (text === "") {
			window.sessionStorage.removeItem(DRAFT_KEY);
		} else {
			window.sessionStorage.setItem(DRAFT_KEY, text);
		}
	} catch {
		// Private mode: the draft lasts while the screen is open.
	}
}

// The minutes a start request can take: a brick at a time, the last one
// worth whatever is left. Bricks grow past 10 min only when a lot is left.
function startOptions(available: number): { options: number[]; unit: number } {
	if (available < 1) {
		return { options: [], unit: 10 };
	}
	const unit = available > 120 ? (available > 360 ? 60 : 30) : 10;
	const options: number[] = [];
	for (let minutes = unit; minutes < available; minutes += unit) {
		options.push(minutes);
	}
	options.push(available);
	return { options, unit };
}

function closest(options: readonly number[], target: number): number {
	return (
		[...options].reverse().find((minutes) => minutes <= target) ??
		options[0] ??
		0
	);
}

function Header() {
	return (
		<div className="flex flex-col gap-1">
			<h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.01em]">
				Pedir tiempo
			</h1>
			<p className="text-ink-soft">Mamá o papá reciben tu pedido y deciden.</p>
		</div>
	);
}

function AskForm() {
	const { childId, activities } = useChild();
	const balance = useBalance(childId);
	const ids = { activity: useId(), minutes: useId(), reason: useId() };
	const [activityId, setActivityId] = useState<string | null>(null);
	const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
	const [reason, setReasonState] = useState(readDraft);
	const [reasonError, setReasonError] = useState<string | null>(null);
	const setReason = (text: string) => {
		setReasonState(text);
		saveDraft(text);
		setReasonError(null);
	};

	const balances = balance.data?.balances ?? [];
	// Start on an activity that still has time, if any does.
	const withTime = activities.find(
		(a) => (bagFor(balances, a.id)?.availableSeconds ?? 0) >= 60,
	);
	const chosenId = activityId ?? withTime?.id ?? activities[0]?.id ?? null;
	const chosen = activities.find((a) => a.id === chosenId);
	const look = activityLook(chosen?.code);
	const bag = chosenId === null ? undefined : bagFor(balances, chosenId);
	const available = Math.floor((bag?.availableSeconds ?? 0) / 60);
	const extra = bag !== undefined && bag.availableSeconds === 0;
	const { options, unit } = extra
		? { options: EXTRA_OPTIONS, unit: 10 }
		: startOptions(available);
	const value = options.includes(minutes)
		? minutes
		: closest(options, DEFAULT_MINUTES);

	// A new activity (or its time ran out) starts from the usual amount.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on these only
	useEffect(() => {
		setMinutes(DEFAULT_MINUTES);
	}, [chosenId, extra]);

	const ask = useCommand(
		() =>
			call(
				api.requests.$post({
					json: {
						requestType: extra ? "extra_time" : "start",
						activityId: chosenId ?? "",
						requestedMinutes: value,
						reason: extra ? reason.trim() : undefined,
					},
				}),
			),
		{
			success: "¡Pedido enviado! Te avisamos cuando respondan.",
			errorText: childErrorMessage,
			onSuccess: () => setReason(""),
		},
	);

	if (balance.data === undefined) {
		return balance.error ? (
			<Notice tone="error">{childErrorMessage(balance.error)}</Notice>
		) : (
			<LoadingBricks />
		);
	}
	if (balances.length === 0) {
		return (
			<Notice>
				Todavía no hay reglas de tiempo. Pídele a mamá o papá que las pongan.
			</Notice>
		);
	}
	if (activities.length === 0) {
		return <Notice>No hay actividades para pedir.</Notice>;
	}

	const what = `${minutesText(value)}${extra ? " extra" : ""} de ${chosen?.name ?? "pantalla"}`;

	return (
		<form
			className="flex flex-col gap-5"
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				if (extra && reason.trim() === "") {
					setReasonError("Cuéntales por qué, así pueden decidir.");
					document.getElementById(ids.reason)?.focus();
					return;
				}
				ask.mutate(undefined);
			}}
		>
			<Callout
				className="flex flex-col gap-4 p-4 sm:p-5"
				aria-labelledby={ids.activity}
			>
				<StepTitle number={1} id={ids.activity}>
					¿Qué quieres usar?
				</StepTitle>
				<fieldset className="grid grid-cols-2 gap-2">
					<legend className="sr-only">Actividad</legend>
					{activities.map((activity) => {
						const itemLook = activityLook(activity.code);
						const left = Math.floor(
							(bagFor(balances, activity.id)?.availableSeconds ?? 0) / 60,
						);
						return (
							<label
								key={activity.id}
								className="group relative flex cursor-pointer flex-col gap-2 rounded-control border-[1.5px] border-rule-strong bg-sheet p-3 transition-colors hover:bg-sheet-sunk has-checked:border-ink has-checked:shadow-[inset_0_0_0_1.5px_var(--color-ink)] has-focus-visible:outline-3 has-focus-visible:outline-focus"
							>
								<span
									className="absolute top-2.5 right-2.5 hidden size-6 place-items-center rounded-full bg-ink text-on-ink group-has-checked:grid"
									aria-hidden="true"
								>
									<Check className="size-4" strokeWidth={3} />
								</span>
								<input
									type="radio"
									name="activity"
									value={activity.id}
									checked={chosenId === activity.id}
									onChange={() => setActivityId(activity.id)}
									className="sr-only"
								/>
								<span
									className="grid size-12 place-items-center rounded-full text-white"
									style={{ background: itemLook.color }}
									aria-hidden="true"
								>
									<itemLook.Icon className="size-6" />
								</span>
								<span className="text-lg font-semibold">{activity.name}</span>
								<span className="text-[0.9375rem] text-ink-soft">
									{left > 0
										? `Te quedan ${minutesText(left)}`
										: "Se acabó por hoy"}
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
							? `Se acabó tu tiempo de ${chosen?.name ?? "hoy"}. Puedes pedir tiempo extra: mamá o papá pueden darte menos.`
							: `Toca un ladrillo: cada uno vale ${unit} min. Te quedan ${secondsText(bag?.availableSeconds ?? 0)}.`
					}
				>
					{extra ? "¿Cuánto tiempo extra?" : "¿Cuánto tiempo?"}
				</StepTitle>
				<div className="max-w-md">
					<BrickPicker
						options={options}
						value={value}
						onChange={setMinutes}
						unit={unit}
						color={look.color}
						restColor={extra ? look.tint : "var(--color-balance)"}
						label={extra ? "Minutos extra" : "Minutos"}
					/>
				</div>
				<p className="flex flex-wrap items-baseline gap-x-2">
					<span className="tabular text-[2rem] leading-none font-extrabold tracking-[-0.02em]">
						{minutesText(value)}
					</span>
					<span className="text-lg text-ink-soft">
						{extra ? "extra " : ""}de {chosen?.name ?? "pantalla"}
					</span>
				</p>
			</Callout>

			{extra && (
				<Callout
					className="flex flex-col gap-4 p-4 sm:p-5"
					aria-labelledby={`${ids.reason}-title`}
				>
					<StepTitle
						number={3}
						id={`${ids.reason}-title`}
						hint="Mamá o papá lo leen antes de decidir."
					>
						¿Por qué lo necesitas?
					</StepTitle>
					<fieldset className="flex flex-wrap gap-2">
						<legend className="sr-only">Motivos rápidos</legend>
						{REASONS.map((text) => (
							<button
								key={text}
								type="button"
								aria-pressed={reason === text}
								onClick={() => setReason(text)}
								className="min-h-10 rounded-full border-[1.5px] border-rule-strong bg-sheet px-3.5 text-left font-medium hover:bg-sheet-sunk aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-on-ink"
							>
								{text}
							</button>
						))}
					</fieldset>
					<div className="flex flex-col gap-1.5">
						<label htmlFor={ids.reason} className="font-medium">
							O escríbelo tú
						</label>
						<textarea
							id={ids.reason}
							rows={2}
							maxLength={REASON_MAX}
							required
							aria-describedby={reasonError ? `${ids.reason}-error` : undefined}
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							className={`${inputClass} py-3`}
							placeholder="Por ejemplo: quiero ver el final del capítulo"
						/>
						{reasonError && (
							<p
								id={`${ids.reason}-error`}
								className="flex items-center gap-1.5 font-medium text-ink"
								role="alert"
							>
								<CircleHelp className="size-5 shrink-0" aria-hidden="true" />
								{reasonError}
							</p>
						)}
					</div>
				</Callout>
			)}

			<Button
				type="submit"
				variant="primary"
				block
				className="min-h-14 text-lg"
				icon={<Send className="size-5" aria-hidden="true" />}
				busy={ask.isPending}
				disabled={chosenId === null || options.length === 0}
			>
				Pedir {what}
			</Button>
		</form>
	);
}

function SessionOpen({ status }: { status: string }) {
	return (
		<Callout className="flex flex-col items-start gap-3 p-4 sm:p-5">
			<h2 className="text-xl leading-tight font-semibold">
				{status === "scheduled"
					? "Ya tienes una sesión para más tarde"
					: status === "paused"
						? "Tu sesión está en pausa"
						: "Ya tienes una sesión"}
			</h2>
			<p className="text-ink-soft">
				Solo puede haber una a la vez. Cuando termine, vas a poder pedir otra.
			</p>
			<Link href="/" className={buttonClass("secondary")}>
				Verla en Inicio
			</Link>
		</Callout>
	);
}

export function Ask() {
	const { childId } = useChild();
	const live = useLiveSession(childId);
	const requests = useMyRequests();
	const { arrival } = requests;
	const [askAgain, setAskAgain] = useState(false);
	const cancel = useCommand(
		(requestId: string) =>
			call(api.requests[":requestId"].cancel.$post({ param: { requestId } })),
		{ success: "Pedido cancelado", errorText: childErrorMessage },
	);

	let body: ReactNode;
	if (live.data === undefined || !requests.ready) {
		const error = live.error ?? requests.error;
		body = error ? (
			<Notice tone="error">{childErrorMessage(error)}</Notice>
		) : (
			<LoadingBricks />
		);
	} else if (requests.pending !== null) {
		const pending = requests.pending;
		body = (
			<PendingCard
				request={pending}
				cancelling={cancel.isPending}
				onCancel={() => cancel.mutate(pending.id)}
			/>
		);
	} else if (live.data.live !== null) {
		body = <SessionOpen status={live.data.live.session.status} />;
	} else if (requests.freshAnswer?.status === "rejected" && !askAgain) {
		body = (
			<Button
				icon={<Plus className="size-5" aria-hidden="true" />}
				onClick={() => setAskAgain(true)}
				className="text-lg sm:w-fit"
			>
				Pedir otra cosa
			</Button>
		);
	} else {
		body = <AskForm />;
	}

	const fresh = requests.pending === null ? requests.freshAnswer : null;
	const earlier = requests.today.filter((r) => r.id !== fresh?.id);

	return (
		<div className="mx-auto flex max-w-xl flex-col gap-5">
			<Header />
			<AnswerAnnouncer arrival={arrival} />
			{fresh && (
				<AnswerCard request={fresh} arrived={arrival?.requestId === fresh.id} />
			)}
			{body}
			<TodayList requests={earlier} />
		</div>
	);
}
