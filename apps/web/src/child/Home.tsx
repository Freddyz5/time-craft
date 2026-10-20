// Inicio: how much time is left today and this week, as batteries of
// bricks, with the bonuses earned and when each recharges; and the way to
// ask for more.
import { Hand } from "lucide-react";
import { Link } from "wouter";
import { buttonClass, LoadingBricks, Notice } from "../components/ui";
import { useBalance, useLiveSession } from "../lib/queries";
import { useChild } from "./context";
import { childErrorMessage } from "./errors";
import { Batteries } from "./home/Batteries";

export function Home() {
	const { childId } = useChild();
	const live = useLiveSession(childId);
	const balance = useBalance(childId);

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

	return (
		<div className="mx-auto flex max-w-xl flex-col gap-5">
			<h1 className="sr-only">Tu tiempo</h1>
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
	);
}
