// Time drawn as bricks. A solid brick is time still available, a dashed
// outline is time already used, and the brick in use drains from the top.
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

export type BrickTone = "balance" | "bonus" | "stop" | "activity";

export interface BrickSpec {
	// 1 = solid, 0 = used (outline), in between = draining.
	fill: number;
	color: string;
	// Used bricks keep a faint hint of their colour (bonus bricks stay yellow).
	outline?: string;
}

interface BrickProps extends BrickSpec {
	animate?: "release" | "snap" | undefined;
}

export function Brick({ fill, color, outline, animate }: BrickProps) {
	const id = useId();
	const level = Math.min(1, Math.max(0, fill));
	// The body spans y = 6…25; the studs sit above it.
	const clipY = 1 + (1 - level) * 24;
	const animation =
		animate === "release"
			? "motion-safe:animate-brick-release"
			: animate === "snap"
				? "motion-safe:animate-brick-snap"
				: "";
	return (
		<svg
			viewBox="0 0 40 26"
			className={`block h-auto w-full overflow-visible ${animation}`}
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
					<rect x="7.75" y="1.75" width="8.5" height="5" rx="1.4" />
					<rect x="23.75" y="1.75" width="8.5" height="5" rx="1.4" />
					<rect x="1.75" y="6.75" width="36.5" height="17.5" rx="2.4" />
				</g>
			)}
			{level > 0 && (
				<g clipPath={`url(#${id}-level)`}>
					<rect x="7" y="1" width="10" height="6.5" rx="1.6" fill={color} />
					<rect x="23" y="1" width="10" height="6.5" rx="1.6" fill={color} />
					<rect x="1" y="6" width="38" height="19" rx="2.6" fill={color} />
					{/* Molded plastic: a lit top edge and a shaded base. */}
					<rect
						x="8"
						y="1.6"
						width="8"
						height="1.6"
						rx="0.8"
						fill="#fff"
						opacity="0.45"
					/>
					<rect
						x="24"
						y="1.6"
						width="8"
						height="1.6"
						rx="0.8"
						fill="#fff"
						opacity="0.45"
					/>
					<rect
						x="2.5"
						y="7.2"
						width="35"
						height="2"
						rx="1"
						fill="#fff"
						opacity="0.3"
					/>
					<rect
						x="1"
						y="21"
						width="38"
						height="4"
						rx="2"
						fill="#000"
						opacity="0.16"
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
}

// Remembers each brick's fill between renders, so only a brick that changed
// plays its motion (never on first paint).
function useBrickMotion(bricks: readonly BrickSpec[]) {
	const previous = useRef<number[] | null>(null);
	const motions = bricks.map((brick, index) => {
		const before = previous.current?.[index];
		if (before === undefined || previous.current === null) {
			return undefined;
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
		previous.current = bricks.map((brick) => brick.fill);
	});
	return motions;
}

export function BrickRow({
	bricks,
	perRow,
	label,
	gap = "normal",
	className = "",
}: BrickRowProps) {
	const motions = useBrickMotion(bricks);
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
				/>
			))}
		</div>
	);
}

// `available` of `total` minutes as bricks of `unit` minutes: solid first,
// then the draining one, then outlines.
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

// Minutes over the limit, as red bricks (rounded up: any overrun shows).
export function overrunBricks(overMinutes: number, unit: number): BrickSpec[] {
	const count = overMinutes > 0 ? Math.ceil(overMinutes / unit) : 0;
	return Array.from({ length: count }, () => ({
		fill: 1,
		color: "var(--color-stop)",
	}));
}

export function unitLegend(unit: number): string {
	return `1 ladrillo = ${unit} min`;
}
