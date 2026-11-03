// Reglas: the child's limits. The general quota is shared by every activity;
// an activity may get limits of its own (a separate bag) and go back to the
// general one later. Each quota has its days and its grace after the end.
// Saving never edits a policy: it closes the current one and creates
// another, so the history below keeps every change. The policy in force
// applies to the whole current week. Below the limits, the rules the parents
// write (for the child, and reminders only they see) and the child's «Tus
// reglas» exactly as the child reads them, with a switch for each automatic
// line.

import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw, ScrollText, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "wouter";
import {
	AmountBricks,
	amountBricks,
	BrickRow,
	brickUnit,
} from "../components/bricks";
import {
	automaticRules,
	ChildRules,
	hasVisibleRules,
} from "../components/ChildRules";
import {
	Button,
	buttonClass,
	Callout,
	ConfirmDialog,
	LoadingBricks,
	MinutesStepper,
	Notice,
	Switch,
} from "../components/ui";
import { activityLook } from "../lib/activity";
import { api, call } from "../lib/api";
import { errorMessage } from "../lib/errors";
import {
	dateTimeText,
	minutesText,
	weekDaysText,
	weekdayName,
	weekOrder,
} from "../lib/format";
import {
	keys,
	useCustomRules,
	useHiddenRules,
	usePolicies,
	usePolicyHistory,
} from "../lib/queries";
import type { Activity, Policy } from "../lib/types";
import { useCommand } from "../lib/useCommand";
import { parentName, useParents } from "./context";
import { CustomRuleList } from "./rules/CustomRules";
import { RuleVisibility } from "./rules/RuleVisibility";

interface Limits {
	dailyLimitMinutes: number;
	weeklyLimitMinutes: number;
	weeklyBonusCapMinutes: number;
	warningMinutes: number;
	carryOverExcess: boolean;
	// 0 = Sunday ... 6 = Saturday.
	allowedDays: number[];
	graceMinutes: number;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const DEFAULTS: Limits = {
	dailyLimitMinutes: 60,
	weeklyLimitMinutes: 300,
	weeklyBonusCapMinutes: 60,
	warningMinutes: 5,
	carryOverExcess: false,
	allowedDays: ALL_DAYS,
	graceMinutes: 0,
};

// The short name on each day's tile.
const SHORT_DAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function limitsOf(policy: Policy | undefined): Limits {
	return policy === undefined
		? DEFAULTS
		: {
				dailyLimitMinutes: policy.dailyLimitMinutes,
				weeklyLimitMinutes: policy.weeklyLimitMinutes,
				weeklyBonusCapMinutes: policy.weeklyBonusCapMinutes,
				warningMinutes: policy.warningMinutes,
				carryOverExcess: policy.carryOverExcess,
				allowedDays: policy.allowedDays,
				graceMinutes: policy.graceMinutes,
			};
}

function sameLimits(a: Limits, b: Limits): boolean {
	return (
		a.dailyLimitMinutes === b.dailyLimitMinutes &&
		a.weeklyLimitMinutes === b.weeklyLimitMinutes &&
		a.weeklyBonusCapMinutes === b.weeklyBonusCapMinutes &&
		a.warningMinutes === b.warningMinutes &&
		a.carryOverExcess === b.carryOverExcess &&
		a.graceMinutes === b.graceMinutes &&
		a.allowedDays.length === b.allowedDays.length &&
		a.allowedDays.every((day) => b.allowedDays.includes(day))
	);
}

function summary(limits: Limits, weekStartDay: number): string {
	return [
		`${minutesText(limits.dailyLimitMinutes)} al día`,
		`${minutesText(limits.weeklyLimitMinutes)} a la semana`,
		...(limits.allowedDays.length < 7
			? [`solo ${weekDaysText(limits.allowedDays, weekStartDay)}`]
			: []),
		limits.weeklyBonusCapMinutes > 0
			? `bonos hasta ${minutesText(limits.weeklyBonusCapMinutes)}`
			: "sin bonos",
		limits.warningMinutes > 0
			? `aviso ${limits.warningMinutes} min antes`
			: "sin aviso previo",
		...(limits.graceMinutes > 0
			? [`gracia de ${minutesText(limits.graceMinutes)}`]
			: []),
		...(limits.carryOverExcess
			? ["el exceso se descuenta al día siguiente"]
			: []),
	].join(" · ");
}

function useInvalidateRules(childId: string) {
	const client = useQueryClient();
	return () =>
		Promise.all([
			client.invalidateQueries({ queryKey: keys.policies(childId) }),
			client.invalidateQueries({ queryKey: keys.policyHistory(childId) }),
			client.invalidateQueries({ queryKey: ["balance"] }),
		]);
}

// A weekly amount as a wall of bricks, like the week on Inicio. Large
// amounts use a bigger brick, and the caption says how much it is worth.
function WeekBricks({
	minutes,
	color,
	label,
}: {
	minutes: number;
	color: string;
	label: string;
}) {
	if (minutes <= 0) {
		return null;
	}
	const unit = brickUnit(minutes, 40);
	return (
		<div className="mt-1 flex flex-col gap-1">
			<BrickRow
				bricks={amountBricks(minutes, unit, color)}
				perRow={10}
				gap="tight"
				label={label}
			/>
			{unit !== 10 && (
				<p className="text-[0.8125rem] text-ink-soft">
					1 ladrillo = {unit} min
				</p>
			)}
		</div>
	);
}

// The days a quota can be used: seven tiles in the family's week order, in
// a sunk tray like the segmented control; a chosen day is an ink tile.
function DayPicker({
	value,
	onChange,
	weekStartDay,
}: {
	value: readonly number[];
	onChange: (days: number[]) => void;
	weekStartDay: number;
}) {
	const toggle = (day: number) =>
		onChange(
			value.includes(day)
				? value.filter((other) => other !== day)
				: [...value, day].sort(),
		);
	return (
		<fieldset className="flex flex-col gap-1.5">
			<legend className="mb-1.5 font-medium">Días con tiempo</legend>
			<div className="grid grid-cols-7 gap-1 rounded-control border-[1.5px] border-rule-strong bg-sheet-sunk p-1 pb-1.5 shadow-[inset_0_2px_0_rgb(0_0_0/0.07)]">
				{weekOrder(weekStartDay).map((day) => (
					<label
						key={day}
						className="flex min-h-10 cursor-pointer items-center justify-center rounded-md text-center text-[0.9375rem] font-bold text-ink-soft transition-colors hover:text-ink has-checked:bg-ink has-checked:text-on-ink has-checked:shadow-[0_3px_0_var(--color-ink-side)] has-focus-visible:outline-3 has-focus-visible:outline-focus"
					>
						<input
							type="checkbox"
							checked={value.includes(day)}
							onChange={() => toggle(day)}
							aria-label={weekdayName(day)}
							className="sr-only"
						/>
						<span aria-hidden="true">{SHORT_DAY[day]}</span>
					</label>
				))}
			</div>
			<p
				className={`text-[0.9375rem] ${value.length === 0 ? "text-stop" : "text-ink-soft"}`}
			>
				{value.length === 0
					? "Elige al menos un día."
					: value.length === 7
						? "Tiene tiempo todos los días."
						: `Tiene tiempo ${weekDaysText(value, weekStartDay)}. Los otros días no, salvo que le des tiempo extra.`}
			</p>
		</fieldset>
	);
}

function LimitsForm({
	initial,
	color,
	submitLabel,
	busy,
	onSubmit,
	onCancel,
}: {
	initial: Limits;
	color: string;
	submitLabel: string;
	busy: boolean;
	onSubmit: (limits: Limits) => void;
	onCancel?: () => void;
}) {
	const id = useId();
	const { household } = useParents();
	const weekStartDay = household.family.weekStartDay;
	const [limits, setLimits] = useState(initial);
	const set =
		<K extends keyof Limits>(key: K) =>
		(value: Limits[K]) =>
			setLimits((current) => ({ ...current, [key]: value }));
	const weekTooSmall = limits.weeklyLimitMinutes < limits.dailyLimitMinutes;
	const noDays = limits.allowedDays.length === 0;
	// With fewer days, the week may hold more than the days can use.
	const reachable = limits.dailyLimitMinutes * limits.allowedDays.length;
	const unchanged = sameLimits(limits, initial);

	return (
		<form
			className="flex flex-col gap-5"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit(limits);
			}}
		>
			<fieldset className="flex flex-col gap-4">
				<legend className="mb-3 font-display text-lg leading-tight font-bold text-ink-soft">
					Tiempo
				</legend>
				<div className="grid gap-5 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<label htmlFor={`${id}-daily`} className="font-medium">
							Límite por día
						</label>
						<MinutesStepper
							id={`${id}-daily`}
							label="Límite por día"
							value={limits.dailyLimitMinutes}
							onChange={set("dailyLimitMinutes")}
							step={10}
							max={1440}
						/>
						<div className="mt-1">
							<AmountBricks
								minutes={limits.dailyLimitMinutes}
								color={color}
								label={`${minutesText(limits.dailyLimitMinutes)} al día`}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<label htmlFor={`${id}-weekly`} className="font-medium">
							Límite por semana
						</label>
						<MinutesStepper
							id={`${id}-weekly`}
							label="Límite por semana"
							value={limits.weeklyLimitMinutes}
							onChange={set("weeklyLimitMinutes")}
							step={30}
							max={10080}
						/>
						<WeekBricks
							minutes={limits.weeklyLimitMinutes}
							color={color}
							label={`${minutesText(limits.weeklyLimitMinutes)} a la semana`}
						/>
						<p
							className={`text-[0.9375rem] ${weekTooSmall ? "text-stop" : "text-ink-soft"}`}
						>
							{weekTooSmall
								? "No puede ser menor que el límite por día."
								: `${minutesText(limits.weeklyLimitMinutes)}: lo que se usa cada día se descuenta de aquí.`}
						</p>
						{!weekTooSmall &&
							!noDays &&
							limits.allowedDays.length < 7 &&
							limits.weeklyLimitMinutes > reachable && (
								<p className="text-[0.9375rem] text-ink-soft">
									Con {limits.allowedDays.length}{" "}
									{limits.allowedDays.length === 1 ? "día" : "días"} de{" "}
									{minutesText(limits.dailyLimitMinutes)}, como mucho usa{" "}
									{minutesText(reachable)} a la semana.
								</p>
							)}
					</div>
				</div>
				<DayPicker
					value={limits.allowedDays}
					onChange={set("allowedDays")}
					weekStartDay={weekStartDay}
				/>
				<Switch
					id={`${id}-carry`}
					checked={limits.carryOverExcess}
					onChange={set("carryOverExcess")}
					label="Descontar al día siguiente lo que se pase"
					description="Si un día se pasa del límite, al otro día tiene eso de menos."
				/>
			</fieldset>
			<fieldset className="flex flex-col gap-4 border-t-[1.5px] border-rule pt-5">
				<legend className="sr-only">Bonos, avisos y gracia</legend>
				<p
					aria-hidden="true"
					className="-mt-1 font-display text-lg leading-tight font-bold text-ink-soft"
				>
					Bonos, avisos y gracia
				</p>
				<div className="grid gap-5 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<label htmlFor={`${id}-bonus`} className="font-medium">
							Tope de bonos por semana
						</label>
						<MinutesStepper
							id={`${id}-bonus`}
							label="Tope de bonos por semana"
							value={limits.weeklyBonusCapMinutes}
							onChange={set("weeklyBonusCapMinutes")}
							min={0}
							step={10}
							max={10080}
						/>
						<WeekBricks
							minutes={limits.weeklyBonusCapMinutes}
							color="var(--color-bonus)"
							label={`Bonos hasta ${minutesText(limits.weeklyBonusCapMinutes)}`}
						/>
						<p className="text-[0.9375rem] text-ink-soft">
							Lo máximo que suman las tareas a la semana. No sube el límite del
							día.
						</p>
					</div>
					<div className="flex flex-col gap-1.5">
						<label htmlFor={`${id}-warning`} className="font-medium">
							Aviso antes del final
						</label>
						<MinutesStepper
							id={`${id}-warning`}
							label="Minutos de aviso antes del final"
							value={limits.warningMinutes}
							onChange={set("warningMinutes")}
							min={0}
							step={1}
							max={60}
						/>
						<p className="text-[0.9375rem] text-ink-soft">
							{limits.warningMinutes > 0
								? `Suena y llega un aviso ${limits.warningMinutes} min antes de terminar.`
								: "Sin aviso previo: solo se avisa al terminar."}
						</p>
					</div>
					<div className="flex flex-col gap-1.5">
						<label htmlFor={`${id}-grace`} className="font-medium">
							Gracia al terminar
						</label>
						<MinutesStepper
							id={`${id}-grace`}
							label="Minutos de gracia al terminar"
							value={limits.graceMinutes}
							onChange={set("graceMinutes")}
							min={0}
							step={1}
							max={15}
						/>
						<p className="text-[0.9375rem] text-ink-soft">
							{limits.graceMinutes > 0
								? `Al terminar tiene ${minutesText(limits.graceMinutes)} para avisarte y que la detengas: ese tiempo no se descuenta.`
								: "Sin gracia: lo que pase del final se descuenta."}
						</p>
					</div>
				</div>
			</fieldset>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
				{onCancel && (
					<Button variant="quiet" disabled={busy} onClick={onCancel}>
						Cancelar
					</Button>
				)}
				<Button
					type="submit"
					variant="primary"
					busy={busy}
					disabled={unchanged || weekTooSmall || noDays}
				>
					{submitLabel}
				</Button>
			</div>
		</form>
	);
}

function ActivityLimits({
	activity,
	policy,
	general,
	childId,
}: {
	activity: Activity;
	policy: Policy | undefined;
	general: Policy | undefined;
	childId: string;
}) {
	const { household } = useParents();
	const [editing, setEditing] = useState(false);
	const [confirm, setConfirm] = useState(false);
	const invalidate = useInvalidateRules(childId);
	const look = activityLook(activity.code);
	const save = useCommand(
		(limits: Limits) =>
			call(
				api.children[":childId"].policies.$post({
					param: { childId },
					json: { activityId: activity.id, ...limits },
				}),
			),
		{
			success: `${activity.name} tiene límites propios`,
			onSuccess: () => {
				setEditing(false);
				void invalidate();
			},
		},
	);
	const clear = useCommand(
		() =>
			call(
				api.children[":childId"].policies[":activityId"].$delete({
					param: { childId, activityId: activity.id },
				}),
			),
		{
			success: `${activity.name} vuelve a la cuota general`,
			onSuccess: () => {
				setConfirm(false);
				void invalidate();
			},
		},
	);

	return (
		<li className="flex flex-col gap-4 border-t-[1.5px] border-rule pt-4 first:border-t-0 first:pt-0">
			<div className="flex items-start gap-3">
				<span
					className="grid size-10 shrink-0 place-items-center rounded-full text-white"
					style={{ background: look.color }}
					aria-hidden="true"
				>
					<look.Icon className="size-5" />
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<h3 className="font-semibold">
						{activity.name}
						{!activity.isActive && (
							<span className="font-normal text-ink-soft"> · desactivada</span>
						)}
					</h3>
					<p className="text-ink-soft">
						{policy === undefined
							? "Usa la cuota general."
							: summary(limitsOf(policy), household.family.weekStartDay)}
					</p>
				</div>
			</div>
			{editing ? (
				<LimitsForm
					initial={limitsOf(policy ?? general)}
					color={look.color}
					submitLabel={
						policy === undefined ? "Ponerle estos límites" : "Guardar"
					}
					busy={save.isPending}
					onSubmit={(limits) => save.mutate(limits)}
					onCancel={() => setEditing(false)}
				/>
			) : (
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}
						onClick={() => setEditing(true)}
					>
						{policy === undefined ? "Ponerle límites propios" : "Cambiar"}
					</Button>
					{policy !== undefined && (
						<Button
							size="sm"
							variant="quiet"
							icon={<RotateCcw className="size-4" aria-hidden="true" />}
							onClick={() => setConfirm(true)}
						>
							Volver a la cuota general
						</Button>
					)}
				</div>
			)}
			<ConfirmDialog
				open={confirm}
				title={`¿${activity.name} vuelve a la cuota general?`}
				confirmLabel="Volver a la general"
				tone="primary"
				busy={clear.isPending}
				onClose={() => setConfirm(false)}
				onConfirm={() => clear.mutate(undefined)}
			>
				Deja de tener límites propios y comparte el tiempo con las demás
				actividades desde esta semana. Sus límites de ahora quedan en el
				historial.
			</ConfirmDialog>
		</li>
	);
}

function HistoryList({ policies }: { policies: readonly Policy[] }) {
	const { household, activities, timeZone } = useParents();
	if (policies.length === 0) {
		return <p className="text-ink-soft">Todavía no hay reglas guardadas.</p>;
	}
	return (
		<ol className="flex flex-col">
			{policies.map((policy) => {
				const activity = activities.find((a) => a.id === policy.activityId);
				const current = policy.validTo === null;
				// Which activities a current general policy covers: those without
				// limits of their own.
				const generalFor = activities
					.filter(
						(a) =>
							a.isActive &&
							!policies.some(
								(other) => other.validTo === null && other.activityId === a.id,
							),
					)
					.map((a) => a.name)
					.join(" y ");
				return (
					<li
						key={policy.id}
						className="flex flex-col gap-1 border-t-[1.5px] border-rule py-3 first:border-t-0 first:pt-0 last:pb-0"
					>
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span className="font-semibold">
								{activity ? `Solo ${activity.name}` : "Cuota general"}
							</span>
							{current && (
								<span className="rounded-full bg-balance-tint px-2 py-0.5 text-[0.8125rem] font-semibold text-balance-ink">
									{activity
										? `Vigente para ${activity.name}`
										: generalFor
											? `Vigente para ${generalFor}`
											: "Vigente"}
								</span>
							)}
						</div>
						<p>{summary(limitsOf(policy), household.family.weekStartDay)}</p>
						<p className="tabular text-[0.9375rem] text-ink-soft">
							{current
								? `Desde el ${dateTimeText(policy.validFrom, timeZone)}`
								: `Del ${dateTimeText(policy.validFrom, timeZone)} al ${dateTimeText(policy.validTo ?? "", timeZone)}`}{" "}
							· la puso {parentName(household, policy.createdByParentId)}
						</p>
					</li>
				);
			})}
		</ol>
	);
}

export function Rules() {
	const { child, activities, household } = useParents();
	const childId = child?.id;
	const policies = usePolicies(childId);
	const history = usePolicyHistory(childId);
	const customRules = useCustomRules(childId);
	const hiddenRules = useHiddenRules(childId);
	const invalidate = useInvalidateRules(childId ?? "");

	const saveGeneral = useCommand(
		(limits: Limits) =>
			call(
				api.children[":childId"].policies.$post({
					param: { childId: childId ?? "" },
					json: { activityId: null, ...limits },
				}),
			),
		{ success: "Reglas guardadas", onSuccess: () => void invalidate() },
	);

	if (child === undefined) {
		return (
			<div className="mx-auto max-w-3xl">
				<Notice
					action={
						<Link href="/cuentas" className={buttonClass("primary", "sm")}>
							Crear la cuenta
						</Link>
					}
				>
					Las reglas son por niño: primero crea su cuenta.
				</Notice>
			</div>
		);
	}

	const current = policies.data?.policies;
	const general = current?.find((policy) => policy.activityId === null);
	// «Tus reglas» as the child gets it: their rules and the lines not hidden.
	const preview = {
		policies: current ?? [],
		customRules: (customRules.data?.rules ?? []).filter(
			(rule) => !rule.parentsOnly,
		),
		hidden: hiddenRules.data?.ruleKeys ?? [],
		requestExpiryMinutes: household.family.requestExpiryMinutes,
		weekStartDay: household.family.weekStartDay,
	};

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-5">
			<div className="flex flex-col gap-1">
				<h1 className="text-[2rem] leading-tight font-extrabold">Reglas</h1>
				<p className="text-ink-soft">
					Cuánto tiempo tiene {child.name} y qué días. Un cambio vale para toda
					esta semana, también para lo que ya usó.
				</p>
			</div>

			{current === undefined ? (
				policies.error ? (
					<Notice tone="error">{errorMessage(policies.error)}</Notice>
				) : (
					<LoadingBricks />
				)
			) : (
				<>
					<Callout
						className="flex flex-col gap-4 p-4 sm:p-5"
						aria-labelledby="general-title"
					>
						<div className="flex flex-col gap-1">
							<h2
								id="general-title"
								className="text-[1.375rem] leading-tight font-bold"
							>
								Cuota general
							</h2>
							<p className="text-ink-soft">
								La comparten todas las actividades que no tienen límites
								propios.
							</p>
						</div>
						<LimitsForm
							key={general?.id ?? "none"}
							initial={limitsOf(general)}
							color="var(--color-balance)"
							submitLabel="Guardar reglas"
							busy={saveGeneral.isPending}
							onSubmit={(limits) => saveGeneral.mutate(limits)}
						/>
					</Callout>

					<Callout
						className="flex flex-col gap-4 p-4 sm:p-5"
						aria-labelledby="activities-title"
					>
						<div className="flex flex-col gap-1">
							<h2
								id="activities-title"
								className="text-[1.375rem] leading-tight font-bold"
							>
								Límites por actividad
							</h2>
							<p className="text-ink-soft">
								Para que una actividad tenga su propia bolsa de tiempo, aparte
								de la general.
							</p>
						</div>
						<ul className="flex flex-col gap-4">
							{activities.map((activity) => (
								<ActivityLimits
									key={activity.id}
									activity={activity}
									policy={current.find(
										(policy) => policy.activityId === activity.id,
									)}
									general={general}
									childId={child.id}
								/>
							))}
						</ul>
					</Callout>
				</>
			)}

			{customRules.data ? (
				<>
					<CustomRuleList
						childId={child.id}
						childName={child.name}
						parentsOnly={false}
						rules={customRules.data.rules}
						title={`Reglas para ${child.name}`}
						description={`Acuerdos que ${child.name} lee en «Tus reglas». La app no los hace cumplir.`}
						placeholder="Por ejemplo: primero los deberes"
					/>
					<CustomRuleList
						childId={child.id}
						childName={child.name}
						parentsOnly
						rules={customRules.data.rules}
						title="Solo para mamá y papá"
						description={`Recordatorios para no olvidar. ${child.name} no los ve y no cambian nada en la app.`}
						placeholder="Por ejemplo: solo después de comer"
					/>
				</>
			) : customRules.error ? (
				<Notice tone="error">{errorMessage(customRules.error)}</Notice>
			) : (
				<LoadingBricks />
			)}

			{current !== undefined && customRules.data && hiddenRules.data && (
				<Callout
					className="flex flex-col gap-4 p-4 sm:p-5"
					aria-labelledby="preview-title"
				>
					<div className="flex flex-col gap-1">
						<h2
							id="preview-title"
							className="text-[1.375rem] leading-tight font-bold"
						>
							Así lo ve {child.name}
						</h2>
						<p className="text-ink-soft">
							Lo que lee en «Tus reglas», en su Inicio.
						</p>
					</div>
					{hasVisibleRules(preview) ? (
						<div className="flex flex-col gap-3 rounded-control border-[1.5px] border-rule-strong/40 bg-sheet-sunk p-4">
							<p className="flex items-center gap-3 text-lg font-semibold">
								<ScrollText className="size-5 shrink-0" aria-hidden="true" />
								Tus reglas
							</p>
							<ChildRules {...preview} activities={activities} />
						</div>
					) : (
						<Notice>
							Con todo apagado, {child.name} no ve «Tus reglas» en su Inicio.
						</Notice>
					)}
					<RuleVisibility
						childId={child.id}
						childName={child.name}
						lines={automaticRules(preview)}
						hidden={hiddenRules.data.ruleKeys}
					/>
				</Callout>
			)}

			<Callout
				className="flex flex-col gap-4 p-4 sm:p-5"
				aria-labelledby="history-title"
			>
				<div className="flex flex-col gap-1">
					<h2
						id="history-title"
						className="text-[1.375rem] leading-tight font-bold"
					>
						Historial de reglas
					</h2>
					<p className="text-ink-soft">
						Cada cambio queda guardado, del más nuevo al más viejo.
					</p>
				</div>
				{history.data ? (
					<HistoryList policies={history.data.policies} />
				) : history.error ? (
					<Notice tone="error">{errorMessage(history.error)}</Notice>
				) : (
					<LoadingBricks />
				)}
			</Callout>
		</div>
	);
}
