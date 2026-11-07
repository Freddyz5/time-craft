// The limits of one quota (daily and weekly time, days, carry-over, bonus
// cap, warning and grace) and the form that edits them. Shared by the quotas
// in Reglas and their history.
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import {
	AmountBricks,
	amountBricks,
	BrickRow,
	brickUnit,
} from "../../components/bricks";
import { Button, MinutesStepper, Switch } from "../../components/ui";
import {
	minutesText,
	weekDaysText,
	weekdayName,
	weekOrder,
} from "../../lib/format";
import { keys } from "../../lib/queries";
import type { Policy } from "../../lib/types";
import { useParents } from "../context";

export interface Limits {
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

export const DEFAULTS: Limits = {
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

export function limitsOf(policy: Policy | undefined): Limits {
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

export function sameLimits(a: Limits, b: Limits): boolean {
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

export function summary(limits: Limits, weekStartDay: number): string {
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

export interface Amount {
	daily: number;
	weekly: number;
}

function amountText(amount: Amount): string {
	return `${minutesText(amount.daily)} al día y ${minutesText(amount.weekly)} a la semana`;
}

// What every quota adds up to, before and after a change. There is no cap on
// the total: each quota is separate, so this is only for the parents to see.
export function TotalNote({
	before,
	after,
	scope = "En total",
}: {
	before: Amount;
	after: Amount;
	// Whose total it is ("En total", "Entre Juego y TV").
	scope?: string;
}) {
	const same = before.daily === after.daily && before.weekly === after.weekly;
	return (
		<p
			aria-live="polite"
			className="rounded-control border-[1.5px] border-rule-strong/40 bg-sheet-sunk px-3.5 py-2.5 text-[0.9375rem]"
		>
			{same ? (
				<>
					{scope}: hasta{" "}
					<strong className="tabular font-bold">{amountText(after)}</strong>.
				</>
			) : (
				<>
					{scope} pasa de <span className="tabular">{amountText(before)}</span>{" "}
					a <strong className="tabular font-bold">{amountText(after)}</strong>.
				</>
			)}
		</p>
	);
}

export function useInvalidateRules(childId: string) {
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

export function LimitsForm({
	initial,
	color,
	submitLabel,
	busy,
	onSubmit,
	onCancel,
	others,
}: {
	initial: Limits;
	color: string;
	submitLabel: string;
	busy: boolean;
	onSubmit: (limits: Limits) => void;
	onCancel?: () => void;
	// The daily and weekly limits of the child's other quotas, added up: the
	// form says what the total becomes.
	others?: { dailyMinutes: number; weeklyMinutes: number } | undefined;
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
				{others !== undefined && !weekTooSmall && (
					<TotalNote
						before={{
							daily: others.dailyMinutes + initial.dailyLimitMinutes,
							weekly: others.weeklyMinutes + initial.weeklyLimitMinutes,
						}}
						after={{
							daily: others.dailyMinutes + limits.dailyLimitMinutes,
							weekly: others.weeklyMinutes + limits.weeklyLimitMinutes,
						}}
					/>
				)}
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
