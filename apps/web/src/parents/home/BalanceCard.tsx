// The balance as the api computes it, one block per bag (the general quota
// and any activity with limits of its own): today and the week in bricks,
// and when each recharges. Nothing is computed here but how many bricks to
// draw and how to say it. Minutes are rounded down everywhere, as in the
// countdown, so numbers on screen always add up.
import {
	Brick,
	BrickRow,
	bricksFor,
	brickUnit,
	overrunBricks,
	weekWallBricks,
} from "../../components/bricks";
import { Callout } from "../../components/ui";
import { activityById, activityLook } from "../../lib/activity";
import { useServerNow } from "../../lib/clock";
import { dayText, minutesText, secondsText } from "../../lib/format";
import { timing } from "../../lib/timer";
import type { Activity, Balance, Session } from "../../lib/types";
import { useParents } from "../context";

const DAY_BRICKS = 12;
const WEEK_PER_ROW = 10;
const WEEK_BRICKS = 40;

// The legend shows the pieces themselves, small.
function Swatch({ color, used = false }: { color: string; used?: boolean }) {
	return (
		<span className="inline-block w-6 align-[-2px]" aria-hidden="true">
			<Brick fill={used ? 0 : 1} color={color} />
		</span>
	);
}

function Legend({ bonus }: { bonus: boolean }) {
	return (
		<p className="flex flex-wrap gap-x-3.5 gap-y-1 text-[0.9375rem] text-ink-soft">
			<span>
				<Swatch color="var(--color-balance)" /> por usar
			</span>
			{bonus && (
				<span>
					<Swatch color="var(--color-bonus)" /> bono
				</span>
			)}
			<span>
				<Swatch color="var(--color-balance)" used /> usado
			</span>
		</p>
	);
}

function weekWall(balance: Balance, unit: number) {
	return weekWallBricks(
		{
			totalMinutes: (balance.weeklyLimitSeconds + balance.bonusSeconds) / 60,
			remainingMinutes: balance.weeklyRemainingSeconds / 60,
			bonusMinutes: balance.bonusSeconds / 60,
		},
		unit,
	);
}

interface LiveInBag {
	session: Session;
	activityName: string;
}

function LiveNote({ live }: { live: LiveInBag }) {
	const now = useServerNow(30_000);
	const { session, activityName } = live;
	if (session.status === "scheduled") {
		return (
			<p className="text-[0.9375rem] text-ink-soft">
				La sesión programada aún no se descuenta.
			</p>
		);
	}
	// What is left of a session rounds up ("quedan 13 min" until 12:00), so it
	// adds up with the minutes used, which round down.
	const left = Math.max(
		0,
		Math.ceil(timing(session, now).remainingMs / 60_000),
	);
	if (left === 0) {
		return (
			<p className="text-[0.9375rem] text-ink-soft">
				Lo que siga corriendo en {activityName} también se descuenta.
			</p>
		);
	}
	return (
		<p className="text-[0.9375rem] text-ink-soft">
			Incluye los {minutesText(left)} de la sesión de {activityName}.
		</p>
	);
}

function BagBlock({
	balance,
	label,
	live,
	single,
	headingId,
}: {
	balance: Balance;
	// With several bags: whose bag this is and which kind.
	label: { names: string; scope: string } | null;
	live: LiveInBag | null;
	single: boolean;
	headingId: string;
}) {
	const { timeZone, child } = useParents();
	const toMin = (seconds: number) => seconds / 60;
	const name = child?.name ?? "El niño";
	const Heading = single ? "h2" : "h3";

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

	const weekUnit = Math.max(
		dayUnit,
		brickUnit(
			toMin(balance.weeklyLimitSeconds + balance.bonusSeconds),
			WEEK_BRICKS,
		),
	);
	const { bricks: weekBricks, bonusLeft } = weekWall(balance, weekUnit);

	const available = balance.availableSeconds;
	const weekLimits =
		balance.weeklyRemainingSeconds < balance.dailyRemainingSeconds;
	const bonusCapped = balance.bonusEarnedSeconds > balance.bonusCapSeconds;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<Heading
					id={headingId}
					className="text-[1.75rem] leading-tight font-extrabold"
				>
					{label === null && <span className="sr-only">Saldo: </span>}
					{label === null
						? available > 0
							? `Le quedan ${secondsText(available)} hoy`
							: "No le queda tiempo hoy"
						: available > 0
							? `${label.names}: le quedan ${secondsText(available)} hoy`
							: `${label.names}: no le queda tiempo hoy`}
				</Heading>
				{label && <p className="text-ink-soft">{label.scope}</p>}
				{available === 0 ? (
					<p className="text-ink-soft">
						{balance.weeklyRemainingSeconds === 0
							? `${name} usó toda la semana. Se recarga el ${dayText(balance.nextWeeklyRechargeAt, timeZone)}.`
							: `${name} usó todo lo de hoy. Mañana vuelve a tener ${secondsText(balance.dailyLimitSeconds)}.`}
					</p>
				) : weekLimits ? (
					<p className="text-ink-soft">Lo limita lo que queda de la semana.</p>
				) : null}
				{live && <LiveNote live={live} />}
			</div>

			<Legend bonus={bonusLeft > 0} />

			<div className="flex flex-col gap-2">
				<div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
					<p className="font-display text-lg leading-tight font-bold">Hoy</p>
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
				<p className="text-[0.8125rem] text-ink-soft">
					1 ladrillo = {dayUnit} min
				</p>
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
					<p className="font-display text-lg leading-tight font-bold">Semana</p>
					<p className="tabular text-right text-ink-soft">
						{secondsText(balance.weeklyRemainingSeconds)} de{" "}
						{secondsText(balance.weeklyLimitSeconds + balance.bonusSeconds)}
					</p>
				</div>
				<BrickRow
					bricks={weekBricks}
					perRow={WEEK_PER_ROW}
					gap="tight"
					label={`Semana: ${secondsText(balance.weeklyRemainingSeconds)} por usar${bonusLeft > 0 ? `, ${minutesText(Math.floor(bonusLeft))} de bonos` : ""}`}
				/>
				<p className="text-[0.9375rem] text-ink-soft">
					{balance.bonusSeconds > 0
						? `Ganó ${secondsText(balance.bonusSeconds)} con tareas${
								bonusCapped
									? ` (llegó al tope de ${secondsText(balance.bonusCapSeconds)})`
									: ` de ${secondsText(balance.bonusCapSeconds)} posibles`
							}. `
						: balance.bonusCapSeconds > 0
							? `Puede ganar hasta ${secondsText(balance.bonusCapSeconds)} con tareas. `
							: ""}
					Se recarga el {dayText(balance.nextWeeklyRechargeAt, timeZone)}.
				</p>
				{weekUnit !== dayUnit && (
					<p className="text-[0.9375rem] text-ink-soft">
						En la semana, 1 ladrillo = {weekUnit} min.
					</p>
				)}
			</div>
		</div>
	);
}

// The activities that draw from a bag: its own, or every one without its own
// for the general quota.
function bagActivities(
	balance: Balance,
	balances: readonly Balance[],
	activities: readonly Activity[],
): Activity[] {
	if (balance.activityId !== null) {
		return activities.filter((a) => a.id === balance.activityId);
	}
	return activities.filter(
		(a) => a.isActive && !balances.some((b) => b.activityId === a.id),
	);
}

export function BalanceCard({
	balances,
	live,
}: {
	balances: readonly Balance[];
	live: Session | null;
}) {
	const { activities } = useParents();
	const several = balances.length > 1;
	// The general quota first, then the activities with their own.
	const ordered = [...balances].sort(
		(a, b) => Number(a.activityId !== null) - Number(b.activityId !== null),
	);
	return (
		<Callout
			className="flex flex-col gap-5 p-4 sm:p-5"
			aria-labelledby="balance-title"
		>
			{several && (
				<h2
					id="balance-title"
					className="text-[1.375rem] leading-tight font-bold"
				>
					Saldo
				</h2>
			)}
			{ordered.map((balance, index) => {
				const members = bagActivities(balance, balances, activities);
				const names = members.map((a) => a.name).join(" y ");
				const label = !several
					? null
					: {
							names: names || "Las demás",
							scope:
								balance.activityId === null
									? "Cuota general, compartida."
									: "Límite propio.",
						};
				const liveHere =
					live !== null && members.some((a) => a.id === live.activityId)
						? {
								session: live,
								activityName:
									activityById(activities, live.activityId)?.name ??
									"la actividad",
							}
						: null;
				const own = activityById(activities, balance.activityId);
				return (
					<div
						key={balance.policyId}
						className={index > 0 ? "border-t-[1.5px] border-rule pt-5" : ""}
						style={
							own
								? ({
										"--color-balance": activityLook(own.code).color,
									} as React.CSSProperties)
								: undefined
						}
					>
						<BagBlock
							balance={balance}
							label={label}
							live={liveHere}
							single={!several}
							headingId={
								several ? `balance-${balance.policyId}` : "balance-title"
							}
						/>
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
