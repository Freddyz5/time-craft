// Full-page states that render before an island's shell (loading, errors,
// a login that belongs to nobody): the mark, centred, over a short column.
import type { ReactNode } from "react";
import { BrandMark } from "./brand";

export function StandaloneFrame({ children }: { children: ReactNode }) {
	return (
		<div className="grid min-h-dvh place-items-center px-4 py-10">
			<div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
				<BrandMark className="size-16" />
				{children}
			</div>
		</div>
	);
}
