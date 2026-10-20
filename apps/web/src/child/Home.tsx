// Inicio. Phone order: what is happening now (a running, paused or scheduled
// session), then the batteries of today and the week with the bonuses and
// when each recharges, and the way to ask for more. On a laptop "Ahora" and
// the batteries sit side by side.
import { Hand } from "lucide-react";
import { Link } from "wouter";
import { buttonClass, LoadingBricks, Notice } from "../components/ui";
import { useBalance, useLiveSession, usePolicies } from "../lib/queries";
import { useChild } from "./context";
import { childErrorMessage } from "./errors";
import { Batteries } from "./home/Batteries";
import { NowCard } from "./home/NowCard";

export function Home() {
	const { childId } = useChild();
	const live = useLiveSession(childId);
	const balance = useBalance(childId);
	const policies = usePolicies(childId);

	if (live.data === undefined || balance.data === undefined) {
		const error = live.error ?? balance.error;
		return error ? (
			<div className="mx-auto max-w-xl">
				<Notice tone="error">{childErrorMessage(error)}</Notice>
			</div>
		) : (
			<LoadingBricks />
		);
	}

	const balances = balance.data.balances;
	const session = live.data.live?.session ?? null;
	const exhausted =
		balances.length > 0 && balances.every((b) => b.availableSeconds === 0);
	const now = session !== null && (
		<NowCard
			key={session.id}
			session={session}
			policies={policies.data?.policies ?? []}
		/>
	);

	return (
		<div
			className={`mx-auto grid gap-5 ${
				now
					? "max-w-5xl lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start"
					: "max-w-xl"
			}`}
		>
			<h1 className="sr-only">Tu tiempo</h1>
			{now && <div className="flex flex-col gap-5">{now}</div>}
			<div className="flex flex-col gap-5">
				<Batteries
					balances={balances}
					live={session}
					action={
						balances.length > 0 &&
						session === null && (
							<Link
								href="/pedir"
								className={`${buttonClass(exhausted ? "secondary" : "primary")} min-h-14 text-lg`}
							>
								<Hand className="size-5" aria-hidden="true" />
								{exhausted ? "Pedir tiempo extra" : "Pedir tiempo"}
							</Link>
						)
					}
				/>
			</div>
		</div>
	);
}
