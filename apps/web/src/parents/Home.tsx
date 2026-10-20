// Inicio. Phone order: a forgotten pause first, then the child's pending
// requests (they expire), what is happening now, the balance in bricks, the
// tasks to review and, while this phone has none, the offer to turn on
// notifications. On a laptop the balance moves to its own column.
import { Lock, UserPlus } from "lucide-react";
import { Link } from "wouter";
import { buttonClass, Callout, LoadingBricks, Notice } from "../components/ui";
import { useServerNow } from "../lib/clock";
import { errorMessage } from "../lib/errors";
import { timeText } from "../lib/format";
import { useIsWide } from "../lib/media";
import {
	useBalance,
	useBonusTasks,
	useLiveSession,
	usePendingReports,
	usePendingRequests,
	usePolicies,
} from "../lib/queries";
import { useParents } from "./context";
import { BalanceCard } from "./home/BalanceCard";
import { isLongPause, NowCard } from "./home/NowCard";
import { ReportCard } from "./home/ReportCard";
import { RequestCard } from "./home/RequestCard";
import { PushOffer } from "./PushSetting";

function NoChild() {
	return (
		<Callout className="mx-auto flex max-w-xl flex-col items-start gap-3 p-5">
			<h1 className="text-2xl font-bold">Empecemos por la cuenta del niño</h1>
			<p className="text-ink-soft">
				Con su usuario y su PIN podrá ver su saldo y pedir tiempo desde
				cualquier navegador.
			</p>
			<Link href="/cuentas" className={buttonClass("primary")}>
				<UserPlus className="size-5" aria-hidden="true" />
				Crear la cuenta
			</Link>
		</Callout>
	);
}

export function Home() {
	const { child, timeZone } = useParents();
	const childId = child?.id;
	const live = useLiveSession(childId);
	const balance = useBalance(childId);
	const policies = usePolicies(childId);
	const requests = usePendingRequests();
	const reports = usePendingReports();
	const tasks = useBonusTasks();
	const now = useServerNow(30_000);
	const wide = useIsWide();

	if (child === undefined) {
		return <NoChild />;
	}

	const firstError = live.error ?? balance.error;
	if (live.data === undefined || balance.data === undefined) {
		return firstError ? (
			<Notice tone="error" action={null}>
				{errorMessage(firstError)}
			</Notice>
		) : (
			<LoadingBricks />
		);
	}

	const balances = balance.data.balances;
	const pending = (requests.data?.requests ?? []).filter(
		(r) => r.childId === child.id,
	);
	const toReview = (reports.data?.reports ?? []).filter(
		(r) => r.childId === child.id,
	);
	const longPause = isLongPause(live.data.live, now);
	const locked =
		child.lockedUntil !== null && Date.parse(child.lockedUntil) > now;

	const reportsSection = toReview.length > 0 && (
		<section aria-labelledby="reports-title" className="flex flex-col gap-3">
			<h2 id="reports-title" className="text-xl leading-tight font-semibold">
				Tareas por revisar
			</h2>
			{toReview.map((report) => (
				<ReportCard
					key={report.id}
					report={report}
					task={tasks.data?.tasks.find((t) => t.id === report.bonusTaskId)}
					globalBalance={balances.find((b) => b.activityId === null)}
				/>
			))}
		</section>
	);

	const nowCard = (
		<NowCard
			live={live.data.live}
			balances={balances}
			policies={policies.data?.policies ?? []}
			quiet={pending.length > 0}
		/>
	);

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-5">
			<h1 className="sr-only">Inicio: {child.name}</h1>

			{locked && (
				<Notice
					action={
						<Link href="/cuentas" className={buttonClass("secondary", "sm")}>
							Restablecer PIN
						</Link>
					}
				>
					<span className="flex items-center gap-2">
						<Lock className="size-4.5 shrink-0" aria-hidden="true" />
						La cuenta de {child.name} está bloqueada hasta las{" "}
						{timeText(child.lockedUntil ?? now, timeZone)} por PIN incorrectos.
					</span>
				</Notice>
			)}

			<div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
				<div className="flex flex-col gap-5">
					{longPause && nowCard}

					{pending.length > 0 && (
						<section
							aria-labelledby="requests-title"
							className="flex flex-col gap-3"
						>
							<h2
								id="requests-title"
								className="text-xl leading-tight font-semibold"
							>
								{pending.length === 1
									? "Una solicitud"
									: `${pending.length} solicitudes`}
							</h2>
							{pending.map((request) => (
								<RequestCard
									key={request.id}
									request={request}
									balances={balances}
								/>
							))}
						</section>
					)}

					{!longPause && nowCard}

					{wide && reportsSection}
				</div>

				<div className="flex flex-col gap-5">
					<BalanceCard
						balances={balances}
						live={live.data.live?.session ?? null}
					/>

					{!wide && reportsSection}

					<PushOffer />
				</div>
			</div>
		</div>
	);
}
