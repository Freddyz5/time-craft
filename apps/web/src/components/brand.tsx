// The Time Craft mark: a yellow 2×2 brick seen from the front, with a clock
// hand pressed into it, and the name beside it. The same drawing as
// brand/mark.svg, the source of the logo files and icons: change both.

export function BrandMark({ className = "size-10" }: { className?: string }) {
	return (
		<svg viewBox="0 0 48 48" className={className} aria-hidden="true">
			<rect x="9" y="3" width="12" height="10" rx="3" fill="#ffcd1a" />
			<rect x="27" y="3" width="12" height="10" rx="3" fill="#ffcd1a" />
			<rect x="2" y="10" width="44" height="35" rx="5" fill="#ffcd1a" />
			<path d="M2 37h44v3a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5z" fill="#d9a400" />
			<rect
				x="10.5"
				y="4.5"
				width="9"
				height="2.5"
				rx="1.25"
				fill="#fff"
				opacity="0.55"
			/>
			<rect
				x="28.5"
				y="4.5"
				width="9"
				height="2.5"
				rx="1.25"
				fill="#fff"
				opacity="0.55"
			/>
			<rect
				x="5"
				y="12.5"
				width="38"
				height="3"
				rx="1.5"
				fill="#fff"
				opacity="0.45"
			/>
			<path
				d="M24 18.5v9.5l6.5 3.5"
				fill="none"
				stroke="#171a20"
				strokeWidth="4.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function Wordmark({
	size = "md",
	className = "",
}: {
	size?: "md" | "lg";
	className?: string;
}) {
	const large = size === "lg";
	return (
		<span
			className={`flex items-center ${large ? "gap-3" : "gap-2.5"} ${className}`}
		>
			<BrandMark className={`${large ? "size-14" : "size-10"} shrink-0`} />
			<span
				className={`pt-1 font-display leading-none font-extrabold tracking-[-0.01em] ${large ? "text-[2rem]" : "text-[1.375rem]"}`}
			>
				Time Craft
			</span>
		</span>
	);
}
