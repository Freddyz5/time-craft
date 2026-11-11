// Reglas: the child's limits. Each activity uses a quota of its own or
// shares the general one, which exists while two or more share it; the
// quotas, with their total, are in rules/Quotas.tsx. Each quota has its days
// and its grace after the end. Saving never edits a policy: it closes the
// current one and creates another, so the history below keeps every change.
// The policy in force applies to the whole current week. Below the limits,
// the rules the parents write (for the child, and reminders only they see)
// and the child's «Tus reglas» exactly as the child reads them, with a switch
// for each automatic line.

import { ScrollText } from "lucide-react";
import { Link } from "wouter";
import {
	automaticRules,
	ChildRules,
	hasVisibleRules,
} from "../components/ChildRules";
import { buttonClass, Callout, LoadingBricks, Notice } from "../components/ui";
import { bagMembers } from "../lib/activity";
import { errorMessage } from "../lib/errors";
import { dateTimeText, namesText } from "../lib/format";
import {
	useCustomRules,
	useHiddenRules,
	usePolicies,
	usePolicyHistory,
} from "../lib/queries";
import type { Policy } from "../lib/types";
import { parentName, useParents } from "./context";
import { Activities } from "./rules/Activities";
import { CustomRuleList } from "./rules/CustomRules";
import { limitsOf, summary } from "./rules/limits";
import { Quotas } from "./rules/Quotas";
import { RuleVisibility } from "./rules/RuleVisibility";

function HistoryList({ policies }: { policies: readonly Policy[] }) {
	const { household, activities, timeZone } = useParents();
	if (policies.length === 0) {
		return <p className="text-ink-soft">Todavía no hay reglas guardadas.</p>;
	}
	return (
		<ol className="flex flex-col">
			{policies.map((policy) => {
				const activity = activities.find((a) => a.id === policy.activityId);
				const current = policy.validTo === null;
				// Which activities a current general policy covers: those without
				// a quota of their own.
				const generalFor = namesText(
					bagMembers(
						policy,
						policies.filter((other) => other.validTo === null),
						activities,
					).map((a) => a.name),
				);
				return (
					<li
						key={policy.id}
						className="flex flex-col gap-1 border-t-[1.5px] border-rule py-3 first:border-t-0 first:pt-0 last:pb-0"
					>
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span className="font-semibold">
								{activity ? `Solo ${activity.name}` : "Cuota general"}
							</span>
							{current && (
								<span className="rounded-full bg-balance-tint px-2 py-0.5 text-[0.8125rem] font-semibold text-balance-ink">
									{activity
										? `Vigente para ${activity.name}`
										: generalFor
											? `Vigente para ${generalFor}`
											: "Vigente"}
								</span>
							)}
						</div>
						<p>{summary(limitsOf(policy), household.family.weekStartDay)}</p>
						<p className="tabular text-[0.9375rem] text-ink-soft">
							{current
								? `Desde el ${dateTimeText(policy.validFrom, timeZone)}`
								: `Del ${dateTimeText(policy.validFrom, timeZone)} al ${dateTimeText(policy.validTo ?? "", timeZone)}`}{" "}
							· la puso {parentName(household, policy.createdByParentId)}
						</p>
					</li>
				);
			})}
		</ol>
	);
}

export function Rules() {
	const { child, activities, household } = useParents();
	const childId = child?.id;
	const policies = usePolicies(childId);
	const history = usePolicyHistory(childId);
	const customRules = useCustomRules(childId);
	const hiddenRules = useHiddenRules(childId);

	if (child === undefined) {
		return (
			<div className="mx-auto max-w-3xl">
				<Notice
					action={
						<Link href="/cuentas" className={buttonClass("primary", "sm")}>
							Crear la cuenta
						</Link>
					}
				>
					Las reglas son por niño: primero crea su cuenta.
				</Notice>
			</div>
		);
	}

	const current = policies.data?.policies;
	// «Tus reglas» as the child gets it: their rules and the lines not hidden.
	const preview = {
		policies: current ?? [],
		customRules: (customRules.data?.rules ?? []).filter(
			(rule) => !rule.parentsOnly,
		),
		hidden: hiddenRules.data?.ruleKeys ?? [],
		requestExpiryMinutes: household.family.requestExpiryMinutes,
		weekStartDay: household.family.weekStartDay,
	};

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-5">
			<div className="flex flex-col gap-1">
				<h1 className="text-[2rem] leading-tight font-extrabold">Reglas</h1>
				<p className="text-ink-soft">
					Cuánto tiempo tiene {child.name} y qué días. Un cambio vale para toda
					esta semana, también para lo que ya usó.
				</p>
			</div>

			{current === undefined ? (
				policies.error ? (
					<Notice tone="error">{errorMessage(policies.error)}</Notice>
				) : (
					<LoadingBricks />
				)
			) : (
				<Callout
					className="flex flex-col gap-5 p-4 sm:p-5"
					aria-labelledby="activities-title"
				>
					<div className="flex flex-col gap-1">
						<h2
							id="activities-title"
							className="text-[1.375rem] leading-tight font-bold"
						>
							Actividades
						</h2>
						<p className="text-ink-soft">
							Son de toda la familia. Puedes agregar hasta 6 y cambiarles el
							nombre, el color y el ícono.
						</p>
					</div>
					<Activities policies={current} childId={child.id} />
				</Callout>
			)}
			{current !== undefined && (
				<Callout
					className="flex flex-col gap-5 p-4 sm:p-5"
					aria-labelledby="quotas-title"
				>
					<div className="flex flex-col gap-1">
						<h2
							id="quotas-title"
							className="text-[1.375rem] leading-tight font-bold"
						>
							Cuotas
						</h2>
						<p className="text-ink-soft">
							Cada actividad tiene su cuota propia o comparte la general con
							otras. La general existe mientras la compartan dos o más.
						</p>
					</div>
					<Quotas
						policies={current}
						totals={policies.data?.totals}
						childId={child.id}
					/>
				</Callout>
			)}

			{customRules.data ? (
				<>
					<CustomRuleList
						childId={child.id}
						childName={child.name}
						parentsOnly={false}
						rules={customRules.data.rules}
						title={`Reglas para ${child.name}`}
						description={`Acuerdos que ${child.name} lee en «Tus reglas». La app no los hace cumplir.`}
						placeholder="Por ejemplo: primero los deberes"
					/>
					<CustomRuleList
						childId={child.id}
						childName={child.name}
						parentsOnly
						rules={customRules.data.rules}
						title="Solo para mamá y papá"
						description={`Recordatorios para no olvidar. ${child.name} no los ve y no cambian nada en la app.`}
						placeholder="Por ejemplo: solo después de comer"
					/>
				</>
			) : customRules.error ? (
				<Notice tone="error">{errorMessage(customRules.error)}</Notice>
			) : (
				<LoadingBricks />
			)}

			{current !== undefined && customRules.data && hiddenRules.data && (
				<Callout
					className="flex flex-col gap-4 p-4 sm:p-5"
					aria-labelledby="preview-title"
				>
					<div className="flex flex-col gap-1">
						<h2
							id="preview-title"
							className="text-[1.375rem] leading-tight font-bold"
						>
							Así lo ve {child.name}
						</h2>
						<p className="text-ink-soft">
							Lo que lee en «Tus reglas», en su Inicio.
						</p>
					</div>
					{hasVisibleRules(preview) ? (
						<div className="flex flex-col gap-3 rounded-control border-[1.5px] border-rule-strong/40 bg-sheet-sunk p-4">
							<p className="flex items-center gap-3 text-lg font-semibold">
								<ScrollText className="size-5 shrink-0" aria-hidden="true" />
								Tus reglas
							</p>
							<ChildRules {...preview} activities={activities} />
						</div>
					) : (
						<Notice>
							Con todo apagado, {child.name} no ve «Tus reglas» en su Inicio.
						</Notice>
					)}
					<RuleVisibility
						childId={child.id}
						childName={child.name}
						lines={automaticRules(preview)}
						hidden={hiddenRules.data.ruleKeys}
					/>
				</Callout>
			)}

			<Callout
				className="flex flex-col gap-4 p-4 sm:p-5"
				aria-labelledby="history-title"
			>
				<div className="flex flex-col gap-1">
					<h2
						id="history-title"
						className="text-[1.375rem] leading-tight font-bold"
					>
						Historial de reglas
					</h2>
					<p className="text-ink-soft">
						Cada cambio queda guardado, del más nuevo al más viejo.
					</p>
				</div>
				{history.data ? (
					<HistoryList policies={history.data.policies} />
				) : history.error ? (
					<Notice tone="error">{errorMessage(history.error)}</Notice>
				) : (
					<LoadingBricks />
				)}
			</Callout>
		</div>
	);
}
