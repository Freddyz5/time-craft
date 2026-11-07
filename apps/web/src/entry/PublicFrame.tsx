// The public pages' frame (login, recovery): the mark, one line on what the
// app is, a short row of bricks showing the idea, and the form on a plate.
// The child's login leaves the bricks out: to them, bricks are their time.
// The web's version sits in the bottom corner, with the api's.
import { TIMECRAFT_ENV } from "astro:env/client";
import { type ReactNode, useEffect, useState } from "react";
// The release writes the web's version here (scripts/release); Vite bundles
// only this field.
import { version } from "../../package.json";
import { Wordmark } from "../components/brand";
import { BrickRow, bricksFor } from "../components/bricks";
import { api, call } from "../lib/api";

interface ApiHealth {
	version: string;
	// production, dev, preview or local (apps/api/src/environment.ts).
	environment: string;
	// The origin of the web that api serves.
	web: string;
}

// What the api behind /api says about itself. Null until it answers, and if
// it never does (an api from before /api/health, or no connection).
function useApiHealth(): ApiHealth | null {
	const [health, setHealth] = useState<ApiHealth | null>(null);
	useEffect(() => {
		let active = true;
		call(api.health.$get())
			.then(({ app, environment, web }) => {
				if (active) {
					setHealth({ version: app.version, environment, web });
				}
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);
	return health;
}

// The versions, and a warning when this web reaches another web's api: dev
// talking to production's api would write to the family's data. A preview of
// another branch is expected to use dev's api (docs/deploy.md).
function Versions() {
	const health = useApiHealth();
	const previewOnDev =
		TIMECRAFT_ENV === "preview" && health?.environment === "dev";
	return (
		<p className="absolute right-4 bottom-2 text-sm text-ink-faint tabular-nums">
			web v{version}
			{health &&
				(health.web === window.location.origin ? (
					<> · api v{health.version}</>
				) : previewOnDev ? (
					<> · api v{health.version} de dev</>
				) : (
					<span className="font-bold text-stop-ink">
						{" "}
						· api de otra web: {new URL(health.web).host}
					</span>
				))}
		</p>
	);
}

export function PublicFrame({
	title,
	lead,
	children,
	footer,
	bricks = true,
}: {
	title: string;
	lead?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	bricks?: boolean;
}) {
	return (
		<div className="relative flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center sm:py-12">
			<Versions />
			<div className="flex w-full max-w-[25rem] flex-col gap-6">
				<div className="flex flex-col gap-4">
					<Wordmark size="lg" />
					{bricks && (
						<div className="w-44">
							<BrickRow
								bricks={bricksFor(45, 60, 10, "var(--color-balance)")}
								perRow={6}
								gap="tight"
								label="Ejemplo: 45 de 60 minutos disponibles, en ladrillos de 10 minutos"
							/>
						</div>
					)}
				</div>
				<main className="plate flex flex-col gap-5 p-5 sm:p-6">
					<div className="flex flex-col gap-1.5">
						<h1 className="text-[1.75rem] leading-tight font-extrabold">
							{title}
						</h1>
						{lead && <p className="text-ink-soft">{lead}</p>}
					</div>
					{children}
				</main>
				{footer && <div className="px-1 text-ink-soft">{footer}</div>}
			</div>
		</div>
	);
}
