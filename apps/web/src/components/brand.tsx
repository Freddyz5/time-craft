// The Time Craft mark: a yellow 2×2 brick seen from the front, with a clock
// hand pressed into it, and the name beside it. Plus the two yellow studs the
// active tab or row wears on its top edge.

export function BrandMark({ className = "size-8" }: { className?: string }) {
	return (
		<svg viewBox="0 0 48 44" className={className} aria-hidden="true">
			<rect x="9" y="1" width="11" height="9" rx="2.4" fill="#f5cd2f" />
			<rect x="28" y="1" width="11" height="9" rx="2.4" fill="#f5cd2f" />
			<rect x="2" y="8" width="44" height="35" rx="4" fill="#f5cd2f" />
			<rect
				x="10"
				y="2"
				width="9"
				height="2.5"
				rx="1.2"
				fill="#fff"
				opacity="0.55"
			/>
			<rect
				x="29"
				y="2"
				width="9"
				height="2.5"
				rx="1.2"
				fill="#fff"
				opacity="0.55"
			/>
			<rect
				x="4"
				y="9.5"
				width="40"
				height="3"
				rx="1.5"
				fill="#fff"
				opacity="0.4"
			/>
			<rect
				x="2"
				y="37"
				width="44"
				height="6"
				rx="3"
				fill="#000"
				opacity="0.14"
			/>
			<path
				d="M24 17v9.5l6.5 4"
				fill="none"
				stroke="#15191e"
				strokeWidth="4"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function Wordmark({ className = "" }: { className?: string }) {
	return (
		<span className={`flex items-center gap-2.5 ${className}`}>
			<BrandMark />
			<span className="text-lg font-bold tracking-[-0.01em]">Time Craft</span>
		</span>
	);
}

export function Studs() {
	return (
		<span aria-hidden="true" className="flex gap-1.5">
			<span className="h-1.5 w-3 rounded-t-[3px] bg-bonus" />
			<span className="h-1.5 w-3 rounded-t-[3px] bg-bonus" />
		</span>
	);
}
