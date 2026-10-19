// The balance as the api computes it, one block per bag (the global quota and
// any activity with limits of its own): today and the week in bricks, bonus
// bricks in yellow, and when each recharges. Nothing is computed here but how
// many bricks to draw.
import {
	BrickRow,
	bricksFor,
	brickUnit,
	overrunBricks,
} from "../../components/bricks";
import { Callout } from "../../components/ui";
import { activityById, activityLook } from "../../lib/activity";
import { dayText, secondsText } from "../../lib/format";
import type { Balance } from "../../lib/types";
import { useParents } from "../context";

const DAY_BRICKS = 12;
const WEEK_PER_ROW = 10;
const WEEK_BRICKS = 40;

function Legend({ unit, bonus }: { unit: number; bonus: boolean }) {
	const swatch = "inline-block h-3 w-5 rounded-[3px] align-[-1px]";
	return (
		<p className="flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem] text-ink-soft">
			<span>
				<span className={`${swatch} bg-balance`} aria-hidden="true" /> por usar
			</span>
			<span>
				<span
					className={`${swatch} border-[1.5px] border-dashed border-ghost`}
					aria-hidden="true"
				/>{" "}
				usado
			</span>
			{bonus && (
				<span>
					<span className={`${swatch} bg-bonus`} aria-hidden="true" /> bono
				</span>
			)}
			<span>1 ladrillo = {unit} min</span>
		</p>
	);
}

function BagBlock({
	balance,
	label,
}: {
	balance: Balance;
	label: string | null;
}) {
	const { timeZone, child } = useParents();
	const toMin = (seconds: number) => seconds / 60;

	const dayLimit = toMin(balance.dailyLimitSeconds);
	const dayUnit = brickUnit(dayLimit, DAY_BRICKS);
	const dayOver =
		toMin(balance.consumedTodaySeconds + balance.carriedExcessSeconds) -
		dayLimit;
	const dayBricks = [
		...bricksFor(
			toMin(balance.dailyRemainingSeconds),
			dayLimit,
			dayUnit,
			"var(--color-balance)",
		),
		...overrunBricks(dayOver, dayUnit),
	];

	const weekBase = toMin(balance.weeklyLimitSeconds);
	const weekBonus = toMin(balance.bonusSeconds);
	const weekUnit = Math.max(
		dayUnit,
		brickUnit(weekBase + weekBonus, WEEK_BRICKS),
	);
	const weekRemaining = toMin(balance.weeklyRemainingSeconds);
	const baseCount = Math.ceil(weekBase / weekUnit);
	const bonusCount = Math.ceil(weekBonus / weekUnit);
	// Remaining bricks fill the wall from the start: base first, then bonus.
	const weekBricks = [
		...bricksFor(
			weekRemaining,
			baseCount * weekUnit,
			weekUnit,
			"var(--color-balance)",
		),
		...bricksFor(
			weekRemaining - baseCount * weekUnit,
			bonusCount * weekUnit,
			weekUnit,
			"var(--color-bonus)",
			"#c9a514",
		).slice(0, bonusCount),
	];

	const available = balance.availableSeconds;
	const weekLimits =
		balance.weeklyRemainingSeconds < balance.dailyRemainingSeconds;
	const name = child?.name ?? "El niño";
	const bonusCapped = balance.bonusEarnedSeconds > balance.bonusCapSeconds;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-0.5">
				{label && <p className="font-medium text-ink-soft">{label}</p>}
				<p className="text-2xl leading-tight font-bold tracking-[-0.01em]">
					{available > 0
						? `Le quedan ${secondsText(available)}`
						: "No le queda tiempo"}
				</p>
				<p className="text-ink-soft">
					{available === 0
						? balance.weeklyRemainingSeconds === 0
							? `${name} usó toda la semana. Se recarga el ${dayText(balance.nextWeeklyRechargeAt, timeZone)}.`
							: `${name} usó todo lo de hoy. Mañana vuelve a tener ${secondsText(balance.dailyLimitSeconds)}.`
						: weekLimits
							? "Lo limita lo que queda de la semana."
							: "Lo que puede usar hoy, sin pasarse de la semana."}
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex items-baseline justify-between gap-3">
					<h3 className="font-semibold">Hoy</h3>
					<p className="tabular text-ink-soft">
						{secondsText(balance.dailyRemainingSeconds)} de{" "}
						{secondsText(balance.dailyLimitSeconds)}
					</p>
				</div>
				<BrickRow
					bricks={dayBricks}
					perRow={Math.max(6, Math.min(DAY_BRICKS, dayBricks.length))}
					label={`Hoy: ${secondsText(balance.dailyRemainingSeconds)} por usar de ${secondsText(balance.dailyLimitSeconds)}`}
				/>
				{balance.carriedExcessSeconds > 0 && (
					<p className="text-[0.9375rem] text-ink-soft">
						Se descontaron {secondsText(balance.carriedExcessSeconds, true)} que
						se pasó ayer.
					</p>
				)}
				{dayOver > 0 && (
					<p className="text-[0.9375rem] font-medium text-stop">
						Se pasó {secondsText(dayOver * 60, true)} del límite de hoy.
					</p>
				)}
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex items-baseline justify-between gap-3">
					<h3 className="font-semibold">Semana</h3>
					<p className="tabular text-right text-ink-soft">
						{secondsText(balance.weeklyRemainingSeconds)} de{" "}
						{secondsText(balance.weeklyLimitSeconds + balance.bonusSeconds)}
					</p>
				</div>
				<BrickRow
					bricks={weekBricks}
					perRow={WEEK_PER_ROW}
					gap="tight"
					label={`Semana: ${secondsText(balance.weeklyRemainingSeconds)} por usar, ${secondsText(balance.bonusSeconds)} de bonos incluidos`}
				/>
				<p className="text-[0.9375rem] text-ink-soft">
					{balance.bonusSeconds > 0
						? `Incluye ${secondsText(balance.bonusSeconds)} de bonos${
								bonusCapped
									? ` (llegó al tope de ${secondsText(balance.bonusCapSeconds)})`
									: ` de ${secondsText(balance.bonusCapSeconds)} posibles`
							}. `
						: balance.bonusCapSeconds > 0
							? `Puede ganar hasta ${secondsText(balance.bonusCapSeconds)} con tareas. `
							: ""}
					Se recarga el {dayText(balance.nextWeeklyRechargeAt, timeZone)}.
				</p>
			</div>

			<Legend
				unit={weekUnit === dayUnit ? dayUnit : weekUnit}
				bonus={balance.bonusSeconds > 0}
			/>
			{weekUnit !== dayUnit && (
				<p className="-mt-2 text-[0.9375rem] text-ink-soft">
					Hoy, 1 ladrillo = {dayUnit} min.
				</p>
			)}
		</div>
	);
}

export function BalanceCard({ balances }: { balances: readonly Balance[] }) {
	const { activities } = useParents();
	const several = balances.length > 1;
	// The global bag first, then the activities with their own.
	const ordered = [...balances].sort(
		(a, b) => Number(a.activityId !== null) - Number(b.activityId !== null),
	);
	return (
		<Callout
			className="flex flex-col gap-5 p-4 sm:p-5"
			aria-labelledby="balance-title"
		>
			<h2 id="balance-title" className="text-lg font-semibold">
				Saldo
			</h2>
			{ordered.map((balance, index) => {
				const activity = activityById(activities, balance.activityId);
				const otherNames = activities
					.filter(
						(a) => a.isActive && !balances.some((b) => b.activityId === a.id),
					)
					.map((a) => a.name);
				const label = !several
					? null
					: activity === undefined
						? otherNames.length > 0
							? `Cuota general: ${otherNames.join(" y ")}`
							: "Cuota general"
						: `Solo ${activity.name}`;
				return (
					<div
						key={balance.policyId}
						className={index > 0 ? "border-t-[1.5px] border-rule pt-5" : ""}
						style={
							activity
								? ({
										"--color-balance": activityLook(activity.code).color,
									} as React.CSSProperties)
								: undefined
						}
					>
						<BagBlock balance={balance} label={label} />
					</div>
				);
			})}
			{balances.length === 0 && (
				<p className="text-ink-soft">
					Aún no hay límites: el saldo aparece al definirlos en Reglas.
				</p>
			)}
		</Callout>
	);
}
