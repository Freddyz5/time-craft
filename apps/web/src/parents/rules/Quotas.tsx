// Reglas › Cuotas: how the child's time is split. Each activity uses a quota
// of its own or shares the general one, which exists while two or more
// activities share it (the api enforces it). Each quota is edited on its own;
// splitting the general quota between activities, and joining them back into
// one, are a single step each (quota-layout). The quotas are separate bags:
// their total is shown, but nothing caps it.

import {
	Combine,
	Plus,
	RotateCcw,
	SlidersHorizontal,
	Split,
} from "lucide-react";
import { useId, useState } from "react";
import {
	AmountBricks,
	amountBricks,
	BrickRow,
	brickUnit,
} from "../../components/bricks";
import { Button, ConfirmDialog, MinutesStepper } from "../../components/ui";
import { activityLook, bagMembers, bagOrder } from "../../lib/activity";
import { api, call } from "../../lib/api";
import { minutesText, namesText, weekDaysText } from "../../lib/format";
import type { Activity, Policy } from "../../lib/types";
import { useCommand } from "../../lib/useCommand";
import { useParents } from "../context";
import {
	type Amount,
	DEFAULTS,
	type Limits,
	LimitsForm,
	limitsOf,
	summary,
	TotalNote,
	useInvalidateRules,
} from "./limits";

export interface QuotaTotals {
	// Index 0 = Sunday.
	dailyMinutesByDay: number[];
	weeklyMinutes: number;
}

const GENERAL_COLOR = "var(--color-balance)";

function colorOf(activity: Activity | undefined): string {
	return activity ? activityLook(activity).color : GENERAL_COLOR;
}

// The activities of a quota as overlapping round tiles in their colours.
function MemberIcons({
	members,
	size = "md",
}: {
	members: readonly Activity[];
	size?: "sm" | "md";
}) {
	const tile = size === "sm" ? "size-7" : "size-10";
	const icon = size === "sm" ? "size-4" : "size-5";
	return (
		<span className="flex shrink-0 -space-x-2" aria-hidden="true">
			{members.map((activity) => {
				const look = activityLook(activity);
				return (
					<span
						key={activity.id}
						className={`grid ${tile} place-items-center rounded-full text-white ring-2 ring-sheet`}
						style={{ background: look.color }}
					>
						<look.Icon className={icon} />
					</span>
				);
			})}
		</span>
	);
}

// What the layout sends for a quota that stays as it is.
function ownEntry(policy: Policy) {
	return { activityId: policy.activityId ?? "", ...limitsOf(policy) };
}

function useLayout(childId: string, success: string, onDone: () => void) {
	const invalidate = useInvalidateRules(childId);
	return useCommand(
		(json: {
			general: { dailyLimitMinutes: number; weeklyLimitMinutes: number } | null;
			own: ({ activityId: string } & Partial<Limits> & {
					dailyLimitMinutes: number;
					weeklyLimitMinutes: number;
				})[];
		}) =>
			call(
				api.children[":childId"]["quota-layout"].$post({
					param: { childId },
					json,
				}),
			),
		{
			success,
			onSuccess: () => {
				onDone();
				void invalidate();
			},
		},
	);
}

// `total` split in `parts` (one per entry), in steps of `step` minutes, with
// what does not divide evenly on the first.
function shares(total: number, parts: readonly number[], step: number) {
	const count = parts.reduce((sum, part) => sum + part, 0);
	const each = parts.map((part) =>
		Math.max(step, Math.floor((total * part) / count / step) * step),
	);
	const rest = total - each.reduce((sum, value) => sum + value, 0);
	if (rest > 0 && each.length > 0) {
		each[0] = (each[0] ?? 0) + rest;
	}
	return each;
}

// The daily total in words: "2 h al día", or "2 h al día (1 h sábado y
// domingo)" when some days add up to something else.
function dailyTotalText(byDay: readonly number[], weekStartDay: number) {
	const counts = new Map<number, number[]>();
	byDay.forEach((minutes, day) => {
		counts.set(minutes, [...(counts.get(minutes) ?? []), day]);
	});
	const [main] = [...counts.entries()].sort(
		(a, b) => b[1].length - a[1].length || b[0] - a[0],
	);
	const mainMinutes = main?.[0] ?? 0;
	const others = [...counts.entries()]
		.filter(([minutes]) => minutes !== mainMinutes)
		.map(([minutes, days]) =>
			minutes === 0
				? `nada ${weekDaysText(days, weekStartDay)}`
				: `${minutesText(minutes)} ${weekDaysText(days, weekStartDay)}`,
		);
	return {
		main: minutesText(mainMinutes),
		others: others.length > 0 ? ` (${others.join("; ")})` : "",
	};
}

// Every quota together: the totals the api adds up and a day with all of
// them, in bricks of each quota's colour.
function QuotaTotal({
	bags,
	totals,
	activities,
}: {
	bags: readonly Policy[];
	totals: QuotaTotals | undefined;
	activities: readonly Activity[];
}) {
	const { household } = useParents();
	const parts = bags.map((bag) => {
		const members = bagMembers(bag, bags, activities);
		return {
			bag,
			name: namesText(members.map((a) => a.name)),
			color: colorOf(bag.activityId === null ? undefined : members[0]),
		};
	});
	const sum = bags.reduce((total, bag) => total + bag.dailyLimitMinutes, 0);
	// One row, like a day's battery.
	const unit = brickUnit(sum, 12);
	const bricks = parts.flatMap((part) =>
		amountBricks(part.bag.dailyLimitMinutes, unit, part.color),
	);
	const daily =
		totals === undefined
			? null
			: dailyTotalText(totals.dailyMinutesByDay, household.family.weekStartDay);
	return (
		<div className="flex flex-col gap-3 rounded-control border-[1.5px] border-rule-strong/40 bg-sheet-sunk p-3.5 sm:p-4">
			{daily !== null && totals !== undefined && (
				<p>
					<strong className="font-bold">En total</strong>, sumando todas las
					cuotas: hasta{" "}
					<strong className="tabular font-bold">{daily.main}</strong> al día
					{daily.others} y{" "}
					<strong className="tabular font-bold">
						{minutesText(totals.weeklyMinutes)}
					</strong>{" "}
					a la semana.
				</p>
			)}
			<BrickRow
				bricks={bricks}
				perRow={12}
				gap="tight"
				className="max-w-[30rem]"
				label={`Un día con todas las cuotas: ${parts
					.map(
						(part) => `${part.name} ${minutesText(part.bag.dailyLimitMinutes)}`,
					)
					.join(", ")}`}
			/>
			<ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem] text-ink-soft">
				{parts.map((part) => (
					<li key={part.bag.id} className="flex items-center gap-1.5">
						<span
							className="inline-block size-3 rounded-[3px]"
							style={{ background: part.color }}
							aria-hidden="true"
						/>
						{part.name}{" "}
						<span className="tabular">
							{minutesText(part.bag.dailyLimitMinutes)}
						</span>
					</li>
				))}
				{unit !== 10 && <li>1 ladrillo = {unit} min</li>}
			</ul>
			<p className="text-[0.9375rem] text-ink-soft">
				Cada cuota se usa por separado: lo que usa una no se descuenta de las
				otras.
			</p>
		</div>
	);
}

// Daily and weekly minutes of one quota in a split or a join.
function AmountRow({
	label,
	members,
	color,
	value,
	onChange,
}: {
	label: string;
	members: readonly Activity[];
	color: string;
	value: Amount;
	onChange: (value: Amount) => void;
}) {
	const id = useId();
	const weekTooSmall = value.weekly < value.daily;
	return (
		<fieldset className="flex flex-col gap-3 border-t-[1.5px] border-rule pt-4 first:border-t-0 first:pt-0">
			<legend className="contents">
				<span className="flex items-center gap-3 font-display text-lg leading-tight font-bold">
					<MemberIcons members={members} size="sm" />
					{label}
				</span>
			</legend>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<label htmlFor={`${id}-daily`} className="font-medium">
						Por día
					</label>
					<MinutesStepper
						id={`${id}-daily`}
						label={`${label}: límite por día`}
						value={value.daily}
						onChange={(daily) => onChange({ ...value, daily })}
						step={10}
						max={1440}
					/>
					<div className="mt-1">
						<AmountBricks
							minutes={value.daily}
							color={color}
							label={`${label}: ${minutesText(value.daily)} al día`}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1.5">
					<label htmlFor={`${id}-weekly`} className="font-medium">
						Por semana
					</label>
					<MinutesStepper
						id={`${id}-weekly`}
						label={`${label}: límite por semana`}
						value={value.weekly}
						onChange={(weekly) => onChange({ ...value, weekly })}
						step={30}
						max={10080}
					/>
				</div>
			</div>
			{weekTooSmall && (
				<p className="text-[0.9375rem] text-stop">
					La semana no puede ser menor que el día.
				</p>
			)}
		</fieldset>
	);
}

const validAmount = (amount: Amount) =>
	amount.daily >= 1 && amount.weekly >= amount.daily;

// The general quota split between some of its activities: each gets its own
// quota, and the general one keeps the rest (if two or more are left) or
// closes. The new amounts start as the general's time shared out, so the
// total stays the same until the parent changes it.
function SplitRows({
	general,
	separated,
	kept,
	bags,
	childId,
	onDone,
	onCancel,
}: {
	general: Policy;
	separated: readonly Activity[];
	kept: readonly Activity[];
	bags: readonly Policy[];
	childId: string;
	onDone: () => void;
	onCancel: () => void;
}) {
	const { child } = useParents();
	const parts = [
		...separated.map(() => 1),
		...(kept.length > 0 ? [kept.length] : []),
	];
	const daily = shares(general.dailyLimitMinutes, parts, 10);
	const weekly = shares(general.weeklyLimitMinutes, parts, 30);
	const [amounts, setAmounts] = useState<Amount[]>(
		parts.map((_, index) => {
			const day = daily[index] ?? 10;
			return { daily: day, weekly: Math.max(day, weekly[index] ?? day) };
		}),
	);
	const set = (index: number) => (value: Amount) =>
		setAmounts((current) =>
			current.map((amount, i) => (i === index ? value : amount)),
		);
	const generalAmount = kept.length > 0 ? amounts[separated.length] : undefined;
	const save = useLayout(
		childId,
		kept.length > 0
			? `${namesText(separated.map((a) => a.name))} ${separated.length === 1 ? "tiene" : "tienen"} cuota propia`
			: "La cuota general quedó repartida",
		onDone,
	);
	const members = [...separated, ...kept];
	const after = amounts.reduce(
		(total, amount) => ({
			daily: total.daily + amount.daily,
			weekly: total.weekly + amount.weekly,
		}),
		{ daily: 0, weekly: 0 },
	);

	return (
		<form
			className="flex flex-col gap-5"
			onSubmit={(event) => {
				event.preventDefault();
				save.mutate({
					general:
						generalAmount === undefined
							? null
							: {
									dailyLimitMinutes: generalAmount.daily,
									weeklyLimitMinutes: generalAmount.weekly,
								},
					own: [
						...bags.filter((bag) => bag.activityId !== null).map(ownEntry),
						...separated.map((activity, index) => ({
							activityId: activity.id,
							dailyLimitMinutes: amounts[index]?.daily ?? 10,
							weeklyLimitMinutes: amounts[index]?.weekly ?? 10,
						})),
					],
				});
			}}
		>
			<div className="flex flex-col gap-4">
				{separated.map((activity, index) => (
					<AmountRow
						key={activity.id}
						label={activity.name}
						members={[activity]}
						color={activityLook(activity).color}
						value={amounts[index] ?? { daily: 10, weekly: 10 }}
						onChange={set(index)}
					/>
				))}
				{generalAmount !== undefined && (
					<AmountRow
						label={`Cuota general: ${namesText(kept.map((a) => a.name))}`}
						members={kept}
						color={GENERAL_COLOR}
						value={generalAmount}
						onChange={set(separated.length)}
					/>
				)}
			</div>
			<TotalNote
				scope={`Entre ${namesText(members.map((a) => a.name))}`}
				before={{
					daily: general.dailyLimitMinutes,
					weekly: general.weeklyLimitMinutes,
				}}
				after={after}
			/>
			<p className="text-[0.9375rem] text-ink-soft">
				Lo que {child?.name ?? "el niño"} ya usó esta semana queda en la cuota
				de cada actividad. Los días, el aviso, la gracia y el tope de bonos se
				copian de la general; puedes cambiarlos después en cada cuota.
			</p>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
				<Button variant="quiet" disabled={save.isPending} onClick={onCancel}>
					Cancelar
				</Button>
				<Button
					type="submit"
					variant="primary"
					icon={<Split className="size-5" aria-hidden="true" />}
					busy={save.isPending}
					disabled={!amounts.every(validAmount)}
				>
					{kept.length > 0 ? "Darle cuota propia" : "Repartir"}
				</Button>
			</div>
		</form>
	);
}

// Which activities leave the general quota. With two, both do (the general
// cannot keep one); with more, the parent picks, and if only one would be
// left it leaves too.
function SplitForm({
	general,
	members,
	bags,
	childId,
	onDone,
	onCancel,
}: {
	general: Policy;
	members: readonly Activity[];
	bags: readonly Policy[];
	childId: string;
	onDone: () => void;
	onCancel: () => void;
}) {
	const name = useId();
	const [picked, setPicked] = useState<string[]>(
		members.slice(0, members.length === 2 ? 2 : 1).map((a) => a.id),
	);
	const chosen = members.filter((a) => picked.includes(a.id));
	const rest = members.filter((a) => !picked.includes(a.id));
	// The general quota cannot keep a single activity.
	const separated = rest.length === 1 ? members : chosen;
	const kept = rest.length === 1 ? [] : rest;
	return (
		<div className="flex flex-col gap-5">
			{members.length > 2 && (
				<fieldset className="flex flex-col gap-1.5">
					<legend className="mb-1.5 font-medium">
						¿Qué actividades tendrán cuota propia?
					</legend>
					<div className="grid gap-1 rounded-control border-[1.5px] border-rule-strong bg-sheet-sunk p-1 pb-1.5 shadow-[inset_0_2px_0_rgb(0_0_0/0.07)] sm:grid-cols-2">
						{members.map((activity) => (
							<label
								key={activity.id}
								className="group flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 font-bold text-ink-soft transition-colors hover:text-ink has-checked:bg-ink has-checked:text-on-ink has-checked:shadow-[0_3px_0_var(--color-ink-side)] has-focus-visible:outline-3 has-focus-visible:outline-focus"
							>
								<input
									type="checkbox"
									name={name}
									checked={picked.includes(activity.id)}
									onChange={() =>
										setPicked((current) =>
											current.includes(activity.id)
												? current.filter((id) => id !== activity.id)
												: [...current, activity.id],
										)
									}
									className="sr-only"
								/>
								<MemberIcons members={[activity]} size="sm" />
								{activity.name}
							</label>
						))}
					</div>
					<p
						className={`text-[0.9375rem] ${chosen.length === 0 ? "text-stop" : "text-ink-soft"}`}
					>
						{chosen.length === 0
							? "Elige al menos una."
							: rest.length === 1
								? `La cuota general necesita dos actividades: ${rest[0]?.name} también tendrá la suya.`
								: rest.length === 0
									? "La cuota general se reparte entre todas."
									: `La cuota general queda para ${namesText(rest.map((a) => a.name))}.`}
					</p>
				</fieldset>
			)}
			{separated.length > 0 ? (
				<SplitRows
					// New amounts each time the choice changes.
					key={separated.map((a) => a.id).join()}
					general={general}
					separated={separated}
					kept={kept}
					bags={bags}
					childId={childId}
					onDone={onDone}
					onCancel={onCancel}
				/>
			) : (
				<div className="flex justify-end">
					<Button variant="quiet" onClick={onCancel}>
						Cancelar
					</Button>
				</div>
			)}
		</div>
	);
}

// Activities with quotas of their own joined into one general quota. It
// starts as the sum of theirs, so the total stays the same until the parent
// changes it.
function JoinForm({
	from,
	ownBags,
	activities,
	childId,
	onDone,
	onCancel,
}: {
	from: Policy;
	ownBags: readonly Policy[];
	activities: readonly Activity[];
	childId: string;
	onDone: () => void;
	onCancel: () => void;
}) {
	const name = useId();
	const { child } = useParents();
	const activityOf = (bag: Policy) =>
		activities.find((a) => a.id === bag.activityId);
	const [picked, setPicked] = useState<string[]>(
		ownBags.length === 2 ? ownBags.map((bag) => bag.id) : [from.id],
	);
	const chosen = ownBags.filter((bag) => picked.includes(bag.id));
	const before = chosen.reduce(
		(total, bag) => ({
			daily: total.daily + bag.dailyLimitMinutes,
			weekly: total.weekly + bag.weeklyLimitMinutes,
		}),
		{ daily: 0, weekly: 0 },
	);
	// Follows the sum until the parent changes it.
	const [edited, setEdited] = useState<Amount | null>(null);
	const amount = edited ?? before;
	const members = chosen.flatMap((bag) => {
		const activity = activityOf(bag);
		return activity ? [activity] : [];
	});
	const save = useLayout(
		childId,
		`${namesText(members.map((a) => a.name))} comparten la cuota general`,
		onDone,
	);
	const enough = chosen.length >= 2;
	return (
		<form
			className="flex flex-col gap-5"
			onSubmit={(event) => {
				event.preventDefault();
				save.mutate({
					general: {
						dailyLimitMinutes: amount.daily,
						weeklyLimitMinutes: amount.weekly,
					},
					own: ownBags.filter((bag) => !picked.includes(bag.id)).map(ownEntry),
				});
			}}
		>
			{ownBags.length > 2 && (
				<fieldset className="flex flex-col gap-1.5">
					<legend className="mb-1.5 font-medium">
						¿Qué actividades comparten la cuota general?
					</legend>
					<div className="grid gap-1 rounded-control border-[1.5px] border-rule-strong bg-sheet-sunk p-1 pb-1.5 shadow-[inset_0_2px_0_rgb(0_0_0/0.07)] sm:grid-cols-2">
						{ownBags.map((bag) => {
							const activity = activityOf(bag);
							return (
								<label
									key={bag.id}
									className="group flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 font-bold text-ink-soft transition-colors hover:text-ink has-checked:bg-ink has-checked:text-on-ink has-checked:shadow-[0_3px_0_var(--color-ink-side)] has-focus-visible:outline-3 has-focus-visible:outline-focus"
								>
									<input
										type="checkbox"
										name={name}
										checked={picked.includes(bag.id)}
										onChange={() =>
											setPicked((current) =>
												current.includes(bag.id)
													? current.filter((id) => id !== bag.id)
													: [...current, bag.id],
											)
										}
										className="sr-only"
									/>
									{activity && <MemberIcons members={[activity]} size="sm" />}
									{activity?.name}
								</label>
							);
						})}
					</div>
					{!enough && (
						<p className="text-[0.9375rem] text-stop">
							La cuota general necesita al menos dos actividades.
						</p>
					)}
				</fieldset>
			)}
			{enough && (
				<>
					<AmountRow
						label={`Cuota general: ${namesText(members.map((a) => a.name))}`}
						members={members}
						color={GENERAL_COLOR}
						value={amount}
						onChange={setEdited}
					/>
					<TotalNote
						scope={`Entre ${namesText(members.map((a) => a.name))}`}
						before={before}
						after={amount}
					/>
					<p className="text-[0.9375rem] text-ink-soft">
						Lo que {child?.name ?? "el niño"} ya usó esta semana en cada una
						cuenta en la general. Los días, el aviso, la gracia y el tope de
						bonos se copian de la cuota de {members[0]?.name}; puedes cambiarlos
						después.
					</p>
				</>
			)}
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
				<Button variant="quiet" disabled={save.isPending} onClick={onCancel}>
					Cancelar
				</Button>
				<Button
					type="submit"
					variant="primary"
					icon={<Combine className="size-5" aria-hidden="true" />}
					busy={save.isPending}
					disabled={!enough || !validAmount(amount)}
				>
					Juntar
				</Button>
			</div>
		</form>
	);
}

type Mode = "idle" | "edit" | "split" | "join";

// One quota: whose it is, its limits in one line, and what can be done with
// it. Only one form is open at a time.
function QuotaBlock({
	bag,
	bags,
	activities,
	childId,
}: {
	bag: Policy;
	bags: readonly Policy[];
	activities: readonly Activity[];
	childId: string;
}) {
	const titleId = useId();
	const { household } = useParents();
	const [mode, setMode] = useState<Mode>("idle");
	const [confirm, setConfirm] = useState(false);
	const invalidate = useInvalidateRules(childId);
	const members = bagMembers(bag, bags, activities);
	const own = bag.activityId === null ? undefined : members[0];
	const general = bags.find((other) => other.activityId === null);
	const ownBags = bags.filter((other) => other.activityId !== null);
	const others = bags.filter((other) => other.id !== bag.id);
	const title = own ? own.name : "Cuota general";
	const close = () => setMode("idle");

	const save = useCommand(
		(limits: Limits) =>
			call(
				api.children[":childId"].policies.$post({
					param: { childId },
					json: { activityId: bag.activityId, ...limits },
				}),
			),
		{
			success: own ? `Cuota de ${own.name} guardada` : "Cuota general guardada",
			onSuccess: () => {
				close();
				void invalidate();
			},
		},
	);
	const backToGeneral = useCommand(
		() =>
			call(
				api.children[":childId"].policies[":activityId"].$delete({
					param: { childId, activityId: bag.activityId ?? "" },
				}),
			),
		{
			success: `${title} vuelve a la cuota general`,
			onSuccess: () => {
				setConfirm(false);
				void invalidate();
			},
		},
	);
	const generalMembers = general ? bagMembers(general, bags, activities) : [];

	return (
		<section
			aria-labelledby={titleId}
			className="flex flex-col gap-4 border-t-[1.5px] border-rule pt-5 first:border-t-0 first:pt-0"
		>
			<div className="flex items-start gap-3">
				<MemberIcons members={members} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<h3 id={titleId} className="text-[1.25rem] leading-tight font-bold">
						{title}
					</h3>
					<p className="text-ink-soft">
						{own
							? "Cuota propia."
							: `La comparten ${namesText(members.map((a) => a.name))}.`}
					</p>
				</div>
			</div>
			<p>{summary(limitsOf(bag), household.family.weekStartDay)}</p>

			{mode === "edit" && (
				<LimitsForm
					initial={limitsOf(bag)}
					color={colorOf(own)}
					submitLabel="Guardar"
					busy={save.isPending}
					onSubmit={(limits) => save.mutate(limits)}
					onCancel={close}
					others={
						others.length > 0
							? {
									dailyMinutes: others.reduce(
										(total, other) => total + other.dailyLimitMinutes,
										0,
									),
									weeklyMinutes: others.reduce(
										(total, other) => total + other.weeklyLimitMinutes,
										0,
									),
								}
							: undefined
					}
				/>
			)}
			{mode === "split" && !own && (
				<SplitForm
					general={bag}
					members={members}
					bags={bags}
					childId={childId}
					onDone={close}
					onCancel={close}
				/>
			)}
			{mode === "join" && own && (
				<JoinForm
					from={bag}
					ownBags={ownBags}
					activities={activities}
					childId={childId}
					onDone={close}
					onCancel={close}
				/>
			)}
			{mode === "idle" && (
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}
						onClick={() => setMode("edit")}
					>
						Cambiar
					</Button>
					{!own && members.length >= 2 && (
						<Button
							size="sm"
							variant="quiet"
							icon={<Split className="size-4" aria-hidden="true" />}
							onClick={() => setMode("split")}
						>
							{members.length === 2
								? `Repartir entre ${namesText(members.map((a) => a.name))}`
								: "Darle cuota propia a una"}
						</Button>
					)}
					{own && general && (
						<Button
							size="sm"
							variant="quiet"
							icon={<RotateCcw className="size-4" aria-hidden="true" />}
							onClick={() => setConfirm(true)}
						>
							Volver a la general
						</Button>
					)}
					{own && !general && ownBags.length >= 2 && (
						<Button
							size="sm"
							variant="quiet"
							icon={<Combine className="size-4" aria-hidden="true" />}
							onClick={() => setMode("join")}
						>
							{ownBags.length === 2
								? `Juntar con ${namesText(
										ownBags
											.filter((other) => other.id !== bag.id)
											.flatMap(
												(other) =>
													bagMembers(other, bags, activities)[0]?.name ?? [],
											),
									)}`
								: "Juntar en una cuota general"}
						</Button>
					)}
				</div>
			)}
			<ConfirmDialog
				open={confirm}
				title={`¿${title} vuelve a la cuota general?`}
				confirmLabel="Volver a la general"
				tone="primary"
				busy={backToGeneral.isPending}
				onClose={() => setConfirm(false)}
				onConfirm={() => backToGeneral.mutate(undefined)}
			>
				Deja su cuota propia y comparte la general con{" "}
				{namesText(generalMembers.map((a) => a.name))} desde esta semana. Lo que
				ya usó esta semana cuenta en la general. Su cuota de ahora queda en el
				historial.
			</ConfirmDialog>
		</section>
	);
}

// An activity with no quota (there is no general one to share): it cannot be
// used until it gets one.
function NoQuota({
	activity,
	childId,
	initial,
}: {
	activity: Activity;
	childId: string;
	initial: Limits;
}) {
	const titleId = useId();
	const [editing, setEditing] = useState(false);
	const invalidate = useInvalidateRules(childId);
	const save = useCommand(
		(limits: Limits) =>
			call(
				api.children[":childId"].policies.$post({
					param: { childId },
					json: { activityId: activity.id, ...limits },
				}),
			),
		{
			success: `Cuota de ${activity.name} guardada`,
			onSuccess: () => {
				setEditing(false);
				void invalidate();
			},
		},
	);
	return (
		<section
			aria-labelledby={titleId}
			className="flex flex-col gap-4 border-t-[1.5px] border-rule pt-5 first:border-t-0 first:pt-0"
		>
			<div className="flex items-start gap-3">
				<MemberIcons members={[activity]} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<h3 id={titleId} className="text-[1.25rem] leading-tight font-bold">
						{activity.name}
					</h3>
					<p className="text-ink-soft">
						Sin cuota todavía: no se puede usar hasta que le pongas una.
					</p>
				</div>
			</div>
			{editing ? (
				<LimitsForm
					initial={initial}
					color={activityLook(activity).color}
					submitLabel="Ponerle esta cuota"
					busy={save.isPending}
					onSubmit={(limits) => save.mutate(limits)}
					onCancel={() => setEditing(false)}
				/>
			) : (
				<div className="flex">
					<Button
						size="sm"
						icon={<Plus className="size-4" aria-hidden="true" />}
						onClick={() => setEditing(true)}
					>
						Ponerle cuota
					</Button>
				</div>
			)}
		</section>
	);
}

// Before any limit: one general quota for every activity (or the only one's
// own, with a single activity).
function FirstQuota({
	activities,
	childId,
}: {
	activities: readonly Activity[];
	childId: string;
}) {
	const titleId = useId();
	const invalidate = useInvalidateRules(childId);
	const only = activities.length === 1 ? activities[0] : undefined;
	const save = useCommand(
		(limits: Limits) =>
			call(
				api.children[":childId"].policies.$post({
					param: { childId },
					json: { activityId: only?.id ?? null, ...limits },
				}),
			),
		{ success: "Reglas guardadas", onSuccess: () => void invalidate() },
	);
	return (
		<section aria-labelledby={titleId} className="flex flex-col gap-4">
			<div className="flex items-start gap-3">
				<MemberIcons members={activities} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<h3 id={titleId} className="text-[1.25rem] leading-tight font-bold">
						{only ? only.name : "Cuota general"}
					</h3>
					<p className="text-ink-soft">
						{only
							? "Todavía no tiene límites."
							: `Todavía no hay límites. Empieza con una cuota que compartan ${namesText(activities.map((a) => a.name))}; después puedes repartirla.`}
					</p>
				</div>
			</div>
			<LimitsForm
				initial={DEFAULTS}
				color={colorOf(only)}
				submitLabel="Guardar reglas"
				busy={save.isPending}
				onSubmit={(limits) => save.mutate(limits)}
			/>
		</section>
	);
}

export function Quotas({
	policies,
	totals,
	childId,
}: {
	policies: readonly Policy[];
	totals: QuotaTotals | undefined;
	childId: string;
}) {
	const { activities, activeActivities } = useParents();
	const active = new Set(activeActivities.map((a) => a.id));
	// The quotas in use: the general one and those of active activities.
	const bags = bagOrder(
		policies.filter(
			(policy) => policy.activityId === null || active.has(policy.activityId),
		),
		activities,
	);
	const general = bags.find((bag) => bag.activityId === null);
	// Without a general quota, an active activity with no quota of its own
	// has none.
	const without = general
		? []
		: activeActivities.filter(
				(activity) => !bags.some((bag) => bag.activityId === activity.id),
			);
	const someOwn = bags.find((bag) => bag.activityId !== null);

	return (
		<div className="flex flex-col gap-5">
			{bags.length > 1 && (
				<QuotaTotal bags={bags} totals={totals} activities={activities} />
			)}
			{bags.length === 0 ? (
				<FirstQuota activities={activeActivities} childId={childId} />
			) : (
				<div className="flex flex-col gap-5">
					{bags.map((bag) => (
						<QuotaBlock
							key={bag.id}
							bag={bag}
							bags={bags}
							activities={activities}
							childId={childId}
						/>
					))}
					{without.map((activity) => (
						<NoQuota
							key={activity.id}
							activity={activity}
							childId={childId}
							initial={limitsOf(someOwn)}
						/>
					))}
				</div>
			)}
		</div>
	);
}
