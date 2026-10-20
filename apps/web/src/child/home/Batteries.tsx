// The child's balance as batteries made of bricks: today in one row, the week
// as a wall (its unused bonus in yellow), the bonuses earned against the
// weekly cap, and when each one recharges. Both batteries use the same brick
// size, so the day's is the shorter one. The numbers are the api's; this
// only decides how many bricks to draw and how to say it to a 9-year-old.
// Minutes round down, as in the countdown, so the figures always add up.
import { ArrowRight, BatteryCharging } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "wouter";
import {
	BRICK_MINUTES,
	Brick,
	BrickRow,
	type BrickSpec,
	bricksFor,
	brickUnit,
	weekWallBricks,
} from "../../components/bricks";
import { Callout } from "../../components/ui";
import { activityById, activityLook } from "../../lib/activity";
import { useServerNow } from "../../lib/clock";
import { minutesText, rechargeText, secondsText } from "../../lib/format";
import { timing } from "../../lib/timer";
import type { Activity, Balance, Session } from "../../lib/types";
import { useChild } from "../context";

const DAY_BRICKS = 12;
const WEEK_BRICKS = 40;
const BONUS_BRICKS = 12;
// The battery's frame around its bricks: border, padding and terminal.
const FRAME_PX = 30;

const toMin = (seconds: number) => seconds / 60;

// How many bricks per row the week's wall takes: 8 to 12, the one that
// leaves the fullest last row (ten when it is a tie).
function wallColumns(count: number): number {
	if (count <= 8) {
		return Math.max(1, count);
	}
	const fullness = (columns: number) =>
		count % columns === 0 ? 1 : (count % columns) / columns;
	return [10, 9, 8, 12, 11].reduce((best, columns) =>
		fullness(columns) > fullness(best) ? columns : best,
	);
}

// A battery: a thick ink outline with its terminal, cells made of bricks.
// `columns` of `basis` sizes it so its bricks match another battery's.
export function Battery({
	bricks,
	columns,
	basis = columns,
	label,
	gap = "normal",
}: {
	bricks: readonly BrickSpec[];
	columns: number;
	basis?: number;
	label: string;
	gap?: "tight" | "normal";
}) {
	const share = Math.min(1, columns / basis);
	return (
		<div
			className="flex items-stretch"
			style={
				share < 1
					? { width: `calc((100% - ${FRAME_PX}px) * ${share} + ${FRAME_PX}px)` }
					: undefined
			}
		>
			<div className="min-w-0 flex-1 rounded-[14px] border-[3px] border-ink bg-sheet px-2 pt-1.5 pb-2">
				<BrickRow bricks={bricks} perRow={columns} label={label} gap={gap} />
			</div>
			<div className="flex items-center" aria-hidden="true">
				<span className="block h-[38%] min-h-3 w-2 rounded-r-[4px] bg-ink" />
			</div>
		</div>
	);
}

function Swatch({
	kind,
	color,
}: {
	kind: "solid" | "used" | "socket";
	color?: string;
}) {
	const look = {
		solid: "border border-[rgb(21_25_30/0.3)]",
		used: "border-[1.5px] border-dashed border-ghost",
		socket: "border-[1.25px] border-rule-strong bg-sheet-sunk",
	}[kind];
	return (
		<span
			className={`inline-block h-3 w-5 rounded-[3px] align-[-1px] ${look}`}
			style={kind === "solid" ? { background: color } : undefined}
			aria-hidden="true"
		/>
	);
}

function Legend({
	session,
	bonus,
}: {
	// The open session's colour, when its bricks are set apart.
	session: string | null;
	bonus: boolean;
}) {
	return (
		<p className="flex flex-wrap gap-x-3.5 gap-y-1 text-[0.9375rem] text-ink-soft">
			<span>
				<Swatch kind="solid" color="var(--color-balance)" /> por usar
			</span>
			{session && (
				<span>
					<Swatch kind="solid" color={session} /> tu sesión
				</span>
			)}
			{bonus && (
				<span>
					<Swatch kind="solid" color="var(--color-bonus)" /> bono
				</span>
			)}
			<span>
				<Swatch kind="used" /> usado
			</span>
		</p>
	);
}

function Recharge({ children }: { children: ReactNode }) {
	return (
		<p className="flex items-center gap-1.5 text-[0.9375rem] text-ink-soft">
			<BatteryCharging className="size-4.5 shrink-0" aria-hidden="true" />
			{children}
		</p>
	);
}

function RowHead({
	title,
	figure,
	as: Heading = "h3",
}: {
	title: string;
	figure: string;
	as?: "h2" | "h3";
}) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<Heading className="text-lg leading-tight font-semibold">{title}</Heading>
			<p className="tabular text-right text-ink-soft">{figure}</p>
		</div>
	);
}

// Where tasks lead: bonuses add to the week, never to today.
function TasksLink({ dayIsOut }: { dayIsOut: boolean }) {
	return (
		<div className="flex flex-col gap-0.5">
			<Link
				href="/tareas"
				className="inline-flex w-fit items-center gap-1.5 rounded-control py-1 font-medium text-ink underline underline-offset-4"
			>
				{dayIsOut ? "Gana minutos para tu semana" : "Gana más con tareas"}
				<ArrowRight className="size-4.5" aria-hidden="true" />
			</Link>
			{dayIsOut && (
				<p className="text-[0.9375rem] text-ink-soft">
					Las tareas suman a tu semana, no a hoy.
				</p>
			)}
		</div>
	);
}

// Bonuses earned this week against the cap: yellow bricks, then empty
// sockets for what can still be earned.
export function BonusMeter({
	earnedSeconds,
	capSeconds,
	heading = "h3",
	footer,
}: {
	earnedSeconds: number;
	capSeconds: number;
	heading?: "h2" | "h3";
	// What follows the meter while the cap is not reached (a link to tasks).
	footer?: ReactNode;
}) {
	const cap = toMin(capSeconds);
	const earned = Math.min(toMin(earnedSeconds), cap);
	const unit = brickUnit(cap, BONUS_BRICKS);
	const count = Math.max(1, Math.ceil(cap / unit));
	const halves = Math.round((earned / unit) * 2);
	const whole = Math.min(count, Math.floor(halves / 2));
	const half = whole < count && halves % 2 === 1;
	const full = earned >= cap;
	return (
		<div className="flex flex-col gap-2">
			<RowHead
				as={heading}
				title="Bonos de la semana"
				figure={`${minutesText(Math.floor(earned))} de ${minutesText(cap)}`}
			/>
			<div
				role="img"
				aria-label={`Bonos: ganaste ${minutesText(Math.floor(earned))} de ${minutesText(cap)} posibles esta semana`}
				className="grid max-w-[24rem] gap-x-[3px]"
				style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
			>
				{Array.from({ length: count }, (_, index) => (
					// A half-earned place shows its half brick sitting in the socket.
					// biome-ignore lint/suspicious/noArrayIndexKey: places are positions
					<div key={index} className="relative">
						{index < whole ? (
							<Brick fill={1} color="var(--color-bonus)" />
						) : (
							<Brick fill={0} color="var(--color-bonus)" socket />
						)}
						{index === whole && half && (
							<div className="absolute inset-0">
								<Brick fill={1} color="var(--color-bonus)" half />
							</div>
						)}
					</div>
				))}
			</div>
			<p className="flex flex-wrap gap-x-3.5 gap-y-1 text-[0.9375rem] text-ink-soft">
				<span>
					<Swatch kind="solid" color="var(--color-bonus)" /> bono
				</span>
				<span>
					<Swatch kind="socket" /> por ganar
				</span>
				{unit !== BRICK_MINUTES && <span>1 ladrillo = {unit} min</span>}
			</p>
			{full ? (
				<p className="font-medium text-bonus-ink">
					¡Llegaste al tope! Esta semana los bonos ya no suman más.
				</p>
			) : (
				footer
			)}
		</div>
	);
}

// "Te quedan 40 min hoy", or "Juego: te quedan 20 min hoy" for a bag of its own.
function headline(title: string | null, text: string): string {
	return title === null
		? `${text.charAt(0).toUpperCase()}${text.slice(1)}`
		: `${title}: ${text}`;
}

function BagBatteries({
	balance,
	title,
	session,
	asOf,
	main,
	action,
}: {
	balance: Balance;
	// With several bags: whose bag this is ("Juego").
	title: string | null;
	// The open session drawing from this bag, if any.
	session: Session | null;
	// When the api computed this balance (its serverTime).
	asOf: number;
	main: boolean;
	action?: ReactNode;
}) {
	const { timeZone, activities } = useChild();
	const now = useServerNow(60_000);
	const available = balance.availableSeconds;
	const dayIsOut = balance.dailyRemainingSeconds === 0;
	const weekIsOut = balance.weeklyRemainingSeconds === 0;

	// What the open session will still take, at the same instant as the
	// balance, so "after this session" never flickers between polls.
	const running = session !== null && session.status !== "scheduled";
	const reserved = running
		? Math.max(0, timing(session, asOf).remainingMs / 1000)
		: 0;
	const after = Math.max(0, available - reserved);
	const sessionColor =
		running && reserved > 0
			? activityLook(activityById(activities, session.activityId)?.code).color
			: null;

	const dayLimit = toMin(balance.dailyLimitSeconds);
	const dayUnit = brickUnit(dayLimit, DAY_BRICKS);
	const freeToday = toMin(
		Math.max(0, balance.dailyRemainingSeconds - reserved),
	);
	const dayBricks = bricksFor(
		toMin(balance.dailyRemainingSeconds),
		dayLimit,
		dayUnit,
		"var(--color-balance)",
	).map((brick, index) =>
		sessionColor !== null && brick.fill > 0 && index + 0.5 > freeToday / dayUnit
			? { ...brick, color: sessionColor }
			: brick,
	);
	const dayOver =
		balance.consumedTodaySeconds +
		balance.carriedExcessSeconds -
		balance.dailyLimitSeconds;

	const weekTotal = toMin(balance.weeklyLimitSeconds + balance.bonusSeconds);
	const weekUnit = Math.max(dayUnit, brickUnit(weekTotal, WEEK_BRICKS));
	const { bricks: weekBricks, bonusLeft } = weekWallBricks(
		{
			totalMinutes: weekTotal,
			remainingMinutes: toMin(balance.weeklyRemainingSeconds),
			bonusMinutes: toMin(balance.bonusSeconds),
		},
		weekUnit,
	);
	const columns = wallColumns(weekBricks.length);
	const weekLimits =
		available > 0 &&
		balance.weeklyRemainingSeconds < balance.dailyRemainingSeconds;
	const weekDay = rechargeText(balance.nextWeeklyRechargeAt, now, timeZone);
	const Heading = main ? "h2" : "h3";
	// Out of time, what to do next comes first, not under the batteries.
	const actionsFirst = available === 0 && main;
	// Tasks only help while bonuses can still be earned this week.
	const canEarn = balance.bonusCapSeconds > balance.bonusEarnedSeconds;

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-1">
				<Heading
					id={main ? "balance-title" : undefined}
					className={`${main ? "text-2xl sm:text-[1.75rem]" : "text-xl sm:text-2xl"} leading-tight font-bold tracking-[-0.01em]`}
				>
					{headline(
						title,
						available === 0
							? weekIsOut
								? "se acabó tu tiempo de esta semana"
								: "se acabó tu tiempo de hoy"
							: running
								? after >= 60
									? `después de esta sesión te quedan ${secondsText(after)} hoy`
									: "después de esta sesión se acaba tu tiempo de hoy"
								: `te quedan ${secondsText(available)} hoy`,
					)}
				</Heading>
				{available === 0 ? (
					<p className="text-ink-soft">
						{weekIsOut
							? `Tu semana se recarga ${weekDay}.`
							: `Mañana vuelves a tener ${secondsText(balance.dailyLimitSeconds)}.`}
					</p>
				) : weekLimits ? (
					<p className="text-ink-soft">
						Es lo que le queda a tu semana, aunque tu día tenga más.
					</p>
				) : null}
				{session?.status === "scheduled" && (
					<p className="text-ink-soft">
						Tu sesión de más tarde todavía no usa tiempo.
					</p>
				)}
			</div>

			{actionsFirst && (
				<div className="flex flex-col gap-3">
					{action}
					{canEarn && <TasksLink dayIsOut={dayIsOut && !weekIsOut} />}
				</div>
			)}

			<Legend session={sessionColor} bonus={bonusLeft > 0} />

			<section className="flex flex-col gap-2" aria-label="Hoy">
				<RowHead
					title="Hoy"
					figure={`${secondsText(balance.dailyRemainingSeconds)} de ${secondsText(balance.dailyLimitSeconds)}`}
				/>
				<Battery
					bricks={dayBricks}
					columns={dayBricks.length}
					basis={dayUnit === weekUnit ? columns : dayBricks.length}
					label={`Hoy: te quedan ${secondsText(balance.dailyRemainingSeconds)} de ${secondsText(balance.dailyLimitSeconds)}`}
					gap={dayUnit === weekUnit ? "tight" : "normal"}
				/>
				<Recharge>
					Se recarga mañana
					{dayUnit !== BRICK_MINUTES && ` · 1 ladrillo = ${dayUnit} min`}
				</Recharge>
				{balance.carriedExcessSeconds > 0 && (
					<p className="text-[0.9375rem] text-ink-soft">
						Hoy se descontaron {secondsText(balance.carriedExcessSeconds, true)}{" "}
						que te pasaste ayer.
					</p>
				)}
				{dayOver > 0 && (
					<p className="text-[0.9375rem] text-ink-soft">
						Hoy te pasaste {secondsText(dayOver, true)}: se restan de tu semana.
					</p>
				)}
			</section>

			<section className="flex flex-col gap-2" aria-label="Semana">
				<RowHead
					title="Semana"
					figure={`${secondsText(balance.weeklyRemainingSeconds)} de ${secondsText(balance.weeklyLimitSeconds + balance.bonusSeconds)}`}
				/>
				<Battery
					bricks={weekBricks}
					columns={columns}
					gap="tight"
					label={`Semana: te quedan ${secondsText(balance.weeklyRemainingSeconds)}${bonusLeft > 0 ? `, ${minutesText(Math.floor(bonusLeft))} de bonos` : ""}`}
				/>
				<Recharge>
					Se recarga {weekDay}
					{weekUnit !== dayUnit && ` · aquí 1 ladrillo = ${weekUnit} min`}
				</Recharge>
			</section>

			{main && balance.bonusCapSeconds > 0 && (
				<section aria-label="Bonos">
					<BonusMeter
						earnedSeconds={balance.bonusEarnedSeconds}
						capSeconds={balance.bonusCapSeconds}
						footer={actionsFirst ? null : <TasksLink dayIsOut={false} />}
					/>
				</section>
			)}

			{!actionsFirst && action}
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
	return activities.filter((a) => !balances.some((b) => b.activityId === a.id));
}

export function Batteries({
	balances,
	asOf,
	live,
	action,
}: {
	balances: readonly Balance[];
	// The balance's serverTime.
	asOf: number;
	live: Session | null;
	// What the child can do next (ask for time): under the batteries, or
	// first when the time is used up.
	action?: ReactNode;
}) {
	const { activities } = useChild();
	// The general quota first, then any activity with limits of its own.
	const ordered = [...balances].sort(
		(a, b) => Number(a.activityId !== null) - Number(b.activityId !== null),
	);
	return (
		<Callout
			className="flex flex-col gap-6 p-4 sm:p-5"
			aria-labelledby="balance-title"
		>
			{ordered.map((balance, index) => {
				const members = bagActivities(balance, balances, activities);
				const own = activityById(activities, balance.activityId);
				const session =
					live !== null && members.some((a) => a.id === live.activityId)
						? live
						: null;
				return (
					<div
						key={balance.policyId}
						className={index > 0 ? "border-t-[1.5px] border-rule pt-6" : ""}
						style={
							own
								? ({
										"--color-balance": activityLook(own.code).color,
									} as CSSProperties)
								: undefined
						}
					>
						<BagBatteries
							balance={balance}
							title={own ? own.name : null}
							session={session}
							asOf={asOf}
							main={index === 0}
							action={index === 0 ? action : undefined}
						/>
					</div>
				);
			})}
			{balances.length === 0 && (
				<>
					<h2 id="balance-title" className="text-2xl leading-tight font-bold">
						Todavía no hay reglas de tiempo
					</h2>
					<p className="text-ink-soft">
						Pídele a mamá o papá que pongan tus límites en Time Craft.
					</p>
				</>
			)}
		</Callout>
	);
}
