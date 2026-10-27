// Inicio. Phone order: what is happening now (a running, paused or scheduled
// session), the request waiting for an answer or the answer that just came,
// then the batteries of today and the week with the bonuses and when each
// recharges, and the way to ask for more; below, the rules folded, and while
// this device has no notifications, a quiet offer to turn them on. On a
// laptop "Ahora" and the batteries sit side by side.
import { Hand } from "lucide-react";
import { Link } from "wouter";
import { buttonClass, LoadingBricks, Notice } from "../components/ui";
import { useBalance, useLiveSession, usePolicies } from "../lib/queries";
import { useChild } from "./context";
import { childErrorMessage } from "./errors";
import { Batteries } from "./home/Batteries";
import { NowCard } from "./home/NowCard";
import { Rules } from "./home/Rules";
import { PushOffer } from "./Notifications";
import {
	AnswerAnnouncer,
	AnswerCard,
	PendingStrip,
	useMyRequests,
} from "./requests";

export function Home() {
	const { childId } = useChild();
	const live = useLiveSession(childId);
	const balance = useBalance(childId);
	const policies = usePolicies(childId);
	const requests = useMyRequests();
	const { arrival } = requests;

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
	const strip = requests.pending ? (
		<PendingStrip request={requests.pending} />
	) : requests.freshAnswer ? (
		<AnswerCard
			request={requests.freshAnswer}
			arrived={arrival?.requestId === requests.freshAnswer.id}
		/>
	) : null;
	const now = (session !== null || strip !== null) && (
		<>
			{session !== null && (
				<NowCard
					key={session.id}
					session={session}
					policies={policies.data?.policies ?? []}
					enter={
						arrival?.yes === true && arrival.requestId === session.requestId
					}
				/>
			)}
			{strip}
		</>
	);

	const batteries = (
		<Batteries
			balances={balances}
			asOf={Date.parse(balance.data.serverTime)}
			live={session}
			action={
				balances.length > 0 &&
				session === null &&
				requests.pending === null && (
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
	);
	const extras = (
		<>
			<Rules policies={policies.data?.policies ?? []} />
			<PushOffer />
		</>
	);

	if (!now) {
		return (
			<div className="mx-auto flex max-w-xl flex-col gap-5">
				<h1 className="sr-only">Tu tiempo</h1>
				<AnswerAnnouncer arrival={arrival} />
				{batteries}
				{extras}
			</div>
		);
	}
	// Phone: now, batteries, extras. Laptop: now and extras on the left, the
	// batteries spanning the right, so both columns end near each other.
	return (
		<div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start">
			<h1 className="sr-only">Tu tiempo</h1>
			<AnswerAnnouncer arrival={arrival} />
			<div className="flex flex-col gap-5">{now}</div>
			<div className="flex flex-col gap-5 lg:row-span-2">{batteries}</div>
			<div className="flex flex-col gap-5 lg:self-start">{extras}</div>
		</div>
	);
}
