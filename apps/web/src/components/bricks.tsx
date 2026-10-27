// Time drawn as bricks. One grammar everywhere:
// - a solid brick is time still available;
// - a dashed outline is time already used;
// - the brick in use drains from the top (only in live counts);
// - a half brick, one stud wide, is half a brick's worth (in static amounts:
//   a request, a task's reward, a session's length);
// - an empty socket, a bare strip of plate with its studs showing, is a place
//   a brick can still go (bonus minutes not earned yet). It never means
//   "used".
// One brick is 10 minutes unless a limit is too large to fit a row; then each
// brick is worth more and the legend says so.
import { useEffect, useId, useRef } from "react";

export const BRICK_MINUTES = 10;
const UNITS = [10, 20, 30, 60];

// The smallest brick value from UNITS that fits `minutes` in `maxBricks`.
export function brickUnit(minutes: number, maxBricks: number): number {
	for (const unit of UNITS) {
		if (Math.ceil(minutes / unit) <= maxBricks) {
			return unit;
		}
	}
	return Math.ceil(minutes / maxBricks / 60) * 60;
}

export interface BrickSpec {
	// 1 = solid, 0 = used (outline), in between = draining.
	fill: number;
	color: string;
	// Colour of the dashed outline once used (default: ghost grey).
	outline?: string | undefined;
	// A one-stud brick: half a brick's worth.
	half?: boolean;
	// An empty place for a brick (fill and colour are ignored).
	socket?: boolean;
}

interface BrickProps extends BrickSpec {
	animate?: "release" | "snap" | undefined;
	// Staggers an entrance: this brick's motion starts after the others'.
	delayMs?: number | undefined;
}

// Molded plastic edge: a thin dark rim gives light bricks (yellow on white)
// a visible boundary.
const RIM = "rgb(10 12 16 / 0.24)";

export function Brick({
	fill,
	color,
	outline,
	half = false,
	socket = false,
	animate,
	delayMs,
}: BrickProps) {
	const id = useId();
	const level = Math.min(1, Math.max(0, fill));
	// The body spans y = 6…25; the studs sit above it.
	const clipY = 1 + (1 - level) * 24;
	const width = half ? 18 : 38;
	const studs = half ? [5] : [7, 23];
	const animation =
		animate === "release"
			? "motion-safe:animate-brick-release"
			: animate === "snap"
				? "motion-safe:animate-brick-snap"
				: "";
	if (socket) {
		return (
			<svg
				viewBox="0 0 40 26"
				className={`block h-auto w-full overflow-visible ${animation}`}
				aria-hidden="true"
			>
				<g fill="var(--color-socket)">
					{studs.map((x) => (
						<rect key={x} x={x} y="14" width="10" height="7" rx="2.4" />
					))}
					<rect x="1" y="19.5" width={width} height="5.5" rx="2.2" />
				</g>
				<g fill="#fff" opacity="0.35">
					{studs.map((x) => (
						<rect
							key={x}
							x={x + 1.5}
							y="14.8"
							width="7"
							height="1.4"
							rx="0.7"
						/>
					))}
				</g>
			</svg>
		);
	}
	return (
		<svg
			viewBox="0 0 40 26"
			className={`block h-auto w-full overflow-visible ${animation}`}
			style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
			aria-hidden="true"
		>
			<defs>
				<clipPath id={`${id}-level`}>
					<rect x="0" y={clipY} width="40" height="26" />
				</clipPath>
			</defs>
			{level < 1 && (
				<g
					fill="none"
					stroke={outline ?? "var(--color-ghost)"}
					strokeWidth="1.5"
					strokeDasharray="3.2 2.4"
				>
					{studs.map((x) => (
						<rect
							key={x}
							x={x + 0.75}
							y="1.75"
							width="8.5"
							height="5"
							rx="1.4"
						/>
					))}
					<rect x="1.75" y="6.75" width={width - 1.5} height="17.5" rx="2.4" />
				</g>
			)}
			{level > 0 && (
				<g clipPath={`url(#${id}-level)`}>
					{studs.map((x) => (
						<rect
							key={x}
							x={x}
							y="0.5"
							width="10"
							height="7"
							rx="2.4"
							fill={color}
							stroke={RIM}
							strokeWidth="0.75"
						/>
					))}
					<rect
						x="1"
						y="6"
						width={width}
						height="19"
						rx="3"
						fill={color}
						stroke={RIM}
						strokeWidth="0.75"
					/>
					{/* Moulded volume: lit studs and top edge, a shaded lower face. */}
					{studs.map((x) => (
						<rect
							key={x}
							x={x + 1.5}
							y="1.3"
							width="7"
							height="1.8"
							rx="0.9"
							fill="#fff"
							opacity="0.5"
						/>
					))}
					<rect
						x="2.5"
						y="7.3"
						width={width - 3}
						height="2.2"
						rx="1.1"
						fill="#fff"
						opacity="0.38"
					/>
					<path
						d={`M1.4 19.5H${width + 0.6}V22a3 3 0 0 1-3 3H4.4a3 3 0 0 1-3-3z`}
						fill="#000"
						opacity="0.2"
					/>
				</g>
			)}
		</svg>
	);
}

interface BrickRowProps {
	bricks: readonly BrickSpec[];
	// Bricks per row; rows line up into a wall.
	perRow: number;
	// Accessible summary, e.g. "4 de 6 ladrillos disponibles".
	label: string;
	gap?: "tight" | "normal";
	className?: string;
	// The bricks arrive (an approved request): each solid one snaps in, one
	// after another, on first paint. Instant with reduced motion.
	enter?: boolean;
}

// Remembers each brick's fill between renders, so only a brick that changed
// plays its motion: one used up rises and lets go, a new one (a bonus) snaps
// in. Never on first paint.
function useBrickMotion(bricks: readonly BrickSpec[]) {
	const previous = useRef<number[] | null>(null);
	const motions = bricks.map((brick, index) => {
		if (previous.current === null) {
			return undefined;
		}
		const before = previous.current[index];
		if (brick.socket) {
			return undefined;
		}
		if (before === undefined) {
			return brick.fill > 0 ? ("snap" as const) : undefined;
		}
		if (before > 0 && brick.fill === 0) {
			return "release" as const;
		}
		if (before === 0 && brick.fill === 1) {
			return "snap" as const;
		}
		return undefined;
	});
	useEffect(() => {
		previous.current = bricks.map((brick) => (brick.socket ? 0 : brick.fill));
	});
	return motions;
}

export function BrickRow({
	bricks,
	perRow,
	label,
	gap = "normal",
	className = "",
	enter = false,
}: BrickRowProps) {
	const changes = useBrickMotion(bricks);
	const motions = enter
		? bricks.map((brick) => (brick.fill > 0 ? ("snap" as const) : undefined))
		: changes;
	return (
		<div
			role="img"
			aria-label={label}
			className={`grid ${gap === "tight" ? "gap-x-[3px] gap-y-1" : "gap-x-1 gap-y-1.5"} ${className}`}
			style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
		>
			{bricks.map((brick, index) => (
				<Brick
					// Position is identity: brick 3 stays brick 3 as time passes.
					// biome-ignore lint/suspicious/noArrayIndexKey: see above
					key={index}
					{...brick}
					animate={motions[index]}
					delayMs={enter ? index * 70 : undefined}
				/>
			))}
		</div>
	);
}

// A live count: `available` of `total` minutes as bricks of `unit` minutes,
// solid first, then the draining one, then outlines.
export function bricksFor(
	availableMinutes: number,
	totalMinutes: number,
	unit: number,
	color: string,
	outline?: string,
): BrickSpec[] {
	const count = Math.max(1, Math.ceil(totalMinutes / unit));
	const left = Math.max(0, availableMinutes) / unit;
	return Array.from({ length: count }, (_, index) => ({
		fill: Math.min(1, Math.max(0, left - index)),
		color,
		outline,
	}));
}

// The week's wall: what is left is solid, its tail in yellow for the bonus
// still unused, then outlines for what was used. Minutes in, bricks out.
export function weekWallBricks(
	{
		totalMinutes,
		remainingMinutes,
		bonusMinutes,
	}: { totalMinutes: number; remainingMinutes: number; bonusMinutes: number },
	unit: number,
): { bricks: BrickSpec[]; bonusLeft: number } {
	const bonusLeft = Math.min(bonusMinutes, remainingMinutes);
	const greenUntil = (remainingMinutes - bonusLeft) / unit;
	const bricks = bricksFor(
		remainingMinutes,
		totalMinutes,
		unit,
		"var(--color-balance)",
	).map((brick, index) =>
		brick.fill > 0 && index + 0.5 > greenUntil
			? { ...brick, color: "var(--color-bonus)" }
			: brick,
	);
	return { bricks, bonusLeft };
}

// A fixed amount (asked, earned, planned, used): whole bricks plus a half
// brick for the rest, to the nearest half. `used` draws them as outlines in
// their colour (time already spent).
export function amountBricks(
	minutes: number,
	unit: number,
	color: string,
	{ used = false }: { used?: boolean } = {},
): BrickSpec[] {
	const halves = Math.max(1, Math.round((minutes / unit) * 2));
	const whole = Math.floor(halves / 2);
	const fill = used ? 0 : 1;
	const outline = used ? color : undefined;
	return [
		...Array.from({ length: whole }, () => ({ fill, color, outline })),
		...(halves % 2 === 1 ? [{ fill, color, outline, half: true }] : []),
	];
}

// Minutes over the limit, as red bricks (rounded up: any overrun shows).
export function overrunBricks(overMinutes: number, unit: number): BrickSpec[] {
	const count = overMinutes > 0 ? Math.ceil(overMinutes / unit) : 0;
	return Array.from({ length: count }, () => ({
		fill: 1,
		color: "var(--color-stop)",
	}));
}

// A fixed amount as a short run of bricks (whole ones plus a half), for a
// request, a task's reward or a session's length. Not a wall: it flows inline.
export function AmountBricks({
	minutes,
	color,
	label,
	used = false,
	size = "md",
	enter = false,
}: {
	minutes: number;
	color: string;
	label: string;
	used?: boolean;
	size?: "sm" | "md";
	// Snap in one after another on first paint (see BrickRow).
	enter?: boolean;
}) {
	const unit = brickUnit(minutes, 12);
	const bricks = amountBricks(minutes, unit, color, { used });
	return (
		<div
			role="img"
			aria-label={label}
			className="flex flex-wrap items-end gap-x-[3px] gap-y-1"
		>
			{bricks.map((brick, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: bricks of an amount are interchangeable
					key={index}
					className={size === "sm" ? "w-6" : "w-9"}
				>
					<Brick
						{...brick}
						animate={enter ? "snap" : undefined}
						delayMs={enter ? index * 70 : undefined}
					/>
				</div>
			))}
		</div>
	);
}

// The manual's parts box: the pieces an amount takes, counted ("3×" bricks,
// "1×" half brick), with the minutes beside it. Used for what the child asks
// for and what a task earns.
export function PartsBox({
	minutes,
	color,
	label,
}: {
	minutes: number;
	color: string;
	label: string;
}) {
	const unit = brickUnit(minutes, 12);
	const halves = Math.max(1, Math.round((minutes / unit) * 2));
	const whole = Math.floor(halves / 2);
	const half = halves % 2;
	return (
		<div
			role="img"
			aria-label={label}
			className="inline-flex w-fit items-center gap-4 rounded-control border-[1.5px] border-rule bg-sheet-sunk px-3.5 py-2.5"
		>
			{whole > 0 && (
				<span className="flex items-center gap-2">
					<span className="w-10">
						<Brick fill={1} color={color} />
					</span>
					<span className="tabular text-lg font-bold">{whole}×</span>
				</span>
			)}
			{half > 0 && (
				<span className="flex items-center gap-2">
					{/* The half brick fills the left half of its box: pull the count in. */}
					<span className="-mr-4 w-10">
						<Brick fill={1} color={color} half />
					</span>
					<span className="tabular text-lg font-bold">1×</span>
				</span>
			)}
			<span className="text-ink-soft">
				= {minutes} min
				{unit !== BRICK_MINUTES && (
					<span className="block text-[0.8125rem]">
						1 ladrillo = {unit} min
					</span>
				)}
			</span>
		</div>
	);
}
