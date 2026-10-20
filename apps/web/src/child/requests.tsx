// The child's requests: the pending one (at most one), today's answered ones
// with who answered and their note, and the pieces that show them on Pedir
// and Inicio. A "no" reads as calmly as a "yes": never red.
import {
	ArrowRight,
	Check,
	CircleSlash,
	Hourglass,
	MessageCircle,
	X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { PartsBox } from "../components/bricks";
import { Button, Callout } from "../components/ui";
import { activityById, activityLook } from "../lib/activity";
import { serverNow, useServerNow } from "../lib/clock";
import { calendarDay, countdown, minutesText, timeText } from "../lib/format";
import { useHistory, usePendingRequests } from "../lib/queries";
import type { ChildRequest } from "../lib/types";
import { useChild } from "./context";

// How long an answer stays at the top of Inicio and Pedir.
const FRESH_ANSWER_MS = 60 * 60_000;

export function useMyRequests() {
	const { childId, timeZone } = useChild();
	const pendingQuery = usePendingRequests();
	const pending = pendingQuery.data?.requests[0] ?? null;
	const history = useHistory(childId, undefined, { poll: pending !== null });
	const { refetch } = history;

	// The pending request went away (answered, expired, cancelled): fetch the
	// answer now instead of on the next poll.
	const pendingId = pending?.id ?? null;
	const previous = useRef(pendingId);
	useEffect(() => {
		if (previous.current !== null && previous.current !== pendingId) {
			void refetch();
		}
		previous.current = pendingId;
	}, [pendingId, refetch]);

	const now = serverNow();
	const today = (history.data?.requests ?? []).filter(
		(request) =>
			request.status !== "pending" &&
			calendarDay(request.createdAt, timeZone) === calendarDay(now, timeZone),
	);
	const latest = today[0];
	const freshAnswer =
		latest !== undefined &&
		(latest.status === "approved" || latest.status === "rejected") &&
		latest.resolvedAt !== null &&
		now - Date.parse(latest.resolvedAt) < FRESH_ANSWER_MS
			? latest
			: null;

	return {
		pending,
		today,
		freshAnswer,
		ready: pendingQuery.data !== undefined,
		error: pendingQuery.error ?? history.error,
	};
}

function useActivity(activityId: string) {
	const { activities } = useChild();
	const activity = activityById(activities, activityId);
	return {
		name: activity?.name ?? "pantalla",
		look: activityLook(activity?.code),
	};
}

function expiresText(expiresAt: string, now: number): string {
	const left = Date.parse(expiresAt) - now;
	if (left <= 0) {
		return "en un momento";
	}
	return left > 60_000
		? `en ${minutesText(Math.ceil(left / 60_000))}`
		: `en ${countdown(left)}`;
}

function asked(request: ChildRequest, name: string): string {
	return `${minutesText(request.requestedMinutes)}${
		request.requestType === "extra_time" ? " extra" : ""
	} de ${name}`;
}

// Someone's own words: the child's reason, or a parent's note (signed).
function Quote({
	children,
	by,
	onTint = false,
}: {
	children: string;
	by?: string;
	// Inside a tinted card the quote is white; on a white one, sunk.
	onTint?: boolean;
}) {
	return (
		<blockquote
			className={`rounded-control px-3.5 py-2.5 text-ink ${onTint ? "bg-sheet" : "bg-sheet-sunk"}`}
		>
			<p>«{children}»</p>
			{by && <footer className="text-[0.9375rem] text-ink-soft">{by}</footer>}
		</blockquote>
	);
}

// The pending request on Pedir: what was asked, in pieces, and a way back.
export function PendingCard({
	request,
	onCancel,
	cancelling,
}: {
	request: ChildRequest;
	onCancel: () => void;
	cancelling: boolean;
}) {
	const now = useServerNow();
	const { timeZone } = useChild();
	const { name, look } = useActivity(request.activityId);
	return (
		<Callout
			className="flex flex-col gap-4 p-4 sm:p-5"
			aria-labelledby="pending-title"
		>
			<div className="flex items-center gap-3">
				<span
					className="grid size-11 shrink-0 place-items-center rounded-full bg-sheet-sunk"
					aria-hidden="true"
				>
					<Hourglass className="size-5.5 text-ink" />
				</span>
				<div className="min-w-0">
					<h2
						id="pending-title"
						className="text-xl leading-tight font-semibold"
					>
						Esperando a mamá o papá
					</h2>
					<p className="text-ink-soft">
						Pediste {asked(request, name)} a las{" "}
						{timeText(request.createdAt, timeZone)}.
					</p>
				</div>
			</div>
			<PartsBox
				minutes={request.requestedMinutes}
				color={look.color}
				label={`Pediste ${asked(request, name)}`}
			/>
			{request.reason && <Quote>{request.reason}</Quote>}
			<p className="text-ink-soft">
				Si nadie responde, se cancela solo{" "}
				<span className="tabular">{expiresText(request.expiresAt, now)}</span>.
			</p>
			<Button
				variant="secondary"
				icon={<X className="size-5" aria-hidden="true" />}
				busy={cancelling}
				onClick={onCancel}
				className="sm:w-fit"
			>
				Cancelar pedido
			</Button>
		</Callout>
	);
}

// A parent's answer, fresh: who, what, and their note.
export function AnswerCard({ request }: { request: ChildRequest }) {
	const { parentName } = useChild();
	const { name } = useActivity(request.activityId);
	const who = parentName(request.resolvedByParentId);
	const yes = request.status === "approved";
	const approved = request.approvedMinutes ?? request.requestedMinutes;
	return (
		<Callout
			tone={yes ? "balance" : "plain"}
			className="flex flex-col gap-3 p-4 sm:p-5"
			aria-labelledby={`answer-${request.id}`}
		>
			<div className="flex items-center gap-3">
				<span
					className={`grid size-11 shrink-0 place-items-center rounded-full ${
						yes ? "bg-balance text-white" : "bg-sheet-sunk text-ink"
					}`}
					aria-hidden="true"
				>
					{yes ? (
						<Check className="size-6" strokeWidth={2.5} />
					) : (
						<MessageCircle className="size-5.5" />
					)}
				</span>
				<div className="min-w-0">
					<h2
						id={`answer-${request.id}`}
						className={`text-xl leading-tight font-semibold ${yes ? "text-balance-ink" : ""}`}
					>
						{yes ? `¡${who} dijo que sí!` : `${who} dijo que no esta vez`}
					</h2>
					<p className={yes ? "text-balance-ink" : "text-ink-soft"}>
						{yes
							? approved < request.requestedMinutes
								? `${minutesText(approved)} de ${name} (pediste ${minutesText(request.requestedMinutes)}).`
								: `${minutesText(approved)} de ${name}.`
							: `Pediste ${asked(request, name)}.`}
					</p>
				</div>
			</div>
			{request.responseNote && (
				<Quote by={who} onTint={yes}>
					{request.responseNote}
				</Quote>
			)}
		</Callout>
	);
}

// Inicio's strip for a request still waiting.
export function PendingStrip({ request }: { request: ChildRequest }) {
	const now = useServerNow(15_000);
	const { name } = useActivity(request.activityId);
	return (
		<Link
			href="/pedir"
			className="flex items-center gap-3 rounded-callout border-[1.5px] border-rule bg-sheet p-4 text-ink no-underline shadow-callout transition-colors hover:bg-sheet-sunk"
		>
			<Hourglass className="size-6 shrink-0" aria-hidden="true" />
			<span className="min-w-0 flex-1">
				<span className="block font-semibold">Esperando respuesta</span>
				<span className="block text-[0.9375rem] text-ink-soft">
					{asked(request, name)} · se cancela solo{" "}
					{expiresText(request.expiresAt, now)}
				</span>
			</span>
			<ArrowRight
				className="size-5 shrink-0 text-ink-soft"
				aria-hidden="true"
			/>
		</Link>
	);
}

function TodayItem({ request }: { request: ChildRequest }) {
	const { parentName, timeZone } = useChild();
	const { name, look } = useActivity(request.activityId);
	const who = parentName(request.resolvedByParentId);
	const approved = request.approvedMinutes ?? request.requestedMinutes;
	const status = {
		approved: {
			Icon: Check,
			text:
				approved < request.requestedMinutes
					? `${who} dijo que sí: ${minutesText(approved)}`
					: `${who} dijo que sí`,
			className: "text-balance-ink",
		},
		rejected: {
			Icon: MessageCircle,
			text: `${who} dijo que no esta vez`,
			className: "text-ink-soft",
		},
		expired: {
			Icon: Hourglass,
			text: "Nadie respondió a tiempo",
			className: "text-ink-soft",
		},
		cancelled: {
			Icon: CircleSlash,
			text: "Lo cancelaste",
			className: "text-ink-soft",
		},
		pending: { Icon: Hourglass, text: "Esperando", className: "text-ink-soft" },
	}[request.status] ?? {
		Icon: Hourglass,
		text: request.status,
		className: "text-ink-soft",
	};
	return (
		<li className="flex gap-3 rounded-control border-[1.5px] border-rule bg-sheet p-3">
			<span
				className="grid size-9 shrink-0 place-items-center rounded-full text-white"
				style={{ background: look.color }}
				aria-hidden="true"
			>
				<look.Icon className="size-4.5" />
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-baseline justify-between gap-2">
					<p className="font-semibold">{asked(request, name)}</p>
					<p className="tabular shrink-0 text-[0.9375rem] text-ink-soft">
						{timeText(request.createdAt, timeZone)}
					</p>
				</div>
				<p
					className={`flex items-center gap-1.5 text-[0.9375rem] ${status.className}`}
				>
					<status.Icon className="size-4 shrink-0" aria-hidden="true" />
					{status.text}
				</p>
				{request.responseNote && (
					<p className="text-[0.9375rem] text-ink">«{request.responseNote}»</p>
				)}
			</div>
		</li>
	);
}

export function TodayList({ requests }: { requests: readonly ChildRequest[] }) {
	if (requests.length === 0) {
		return null;
	}
	return (
		<section aria-labelledby="today-title" className="flex flex-col gap-3">
			<h2 id="today-title" className="text-xl leading-tight font-semibold">
				Tus pedidos de hoy
			</h2>
			<ul className="flex flex-col gap-2">
				{requests.map((request) => (
					<TodayItem key={request.id} request={request} />
				))}
			</ul>
		</section>
	);
}
