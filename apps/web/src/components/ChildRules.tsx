// What "Tus reglas" says, in the child's words: the limits in force (with
// their days and grace), the rules the parents wrote for the child and the
// ones every session follows. The parents can hide any automatic line (it
// keeps working, it just is not read here). The child's Inicio folds it under
// the batteries; Reglas shows the parents the very same thing.
import { activityById, bagMembers, type MemberActivity } from "../lib/activity";
import { minutesText, namesText, weekDaysText } from "../lib/format";
import type { HiddenRuleKey, Policy } from "../lib/types";

export interface RuleLine {
	key: HiddenRuleKey;
	text: string;
}

function rulesFor(policy: Policy, weekStartDay: number): RuleLine[] {
	const rules: RuleLine[] = [
		{
			key: "limits",
			text: `${minutesText(policy.dailyLimitMinutes)} al día y ${minutesText(policy.weeklyLimitMinutes)} a la semana.`,
		},
	];
	if (policy.allowedDays.length < 7) {
		rules.push({
			key: "days",
			text: `Tienes tiempo ${weekDaysText(policy.allowedDays, weekStartDay)}. Los otros días descansas.`,
		});
	}
	if (policy.weeklyBonusCapMinutes > 0) {
		rules.push({
			key: "bonus",
			text: `Con tareas ganas hasta ${minutesText(policy.weeklyBonusCapMinutes)} más por semana.`,
		});
	}
	if (policy.warningMinutes > 0) {
		rules.push({
			key: "warning",
			text: `Te avisamos ${minutesText(policy.warningMinutes)} antes de que se acabe una sesión.`,
		});
	}
	if (policy.graceMinutes > 0) {
		rules.push({
			key: "grace",
			text: `Cuando se acaba, tienes ${minutesText(policy.graceMinutes)} para avisar a mamá o papá que la detengan: ese tiempo no cuenta.`,
		});
	}
	if (policy.carryOverExcess) {
		rules.push({
			key: "carry_over",
			text: "Si un día te pasas, se descuenta del día siguiente.",
		});
	}
	return rules;
}

function fixedRules(requestExpiryMinutes: number): RuleLine[] {
	return [
		{
			key: "one_session",
			text: "Una sesión a la vez. Si se pasa del tiempo, lo extra también cuenta.",
		},
		{
			key: "request_wait",
			text: `Un pedido espera ${minutesText(requestExpiryMinutes)} a que mamá o papá respondan.`,
		},
	];
}

const WEEK_CHANGE: RuleLine = {
	key: "week_change",
	text: "Las ponen mamá y papá. Si cambian, aplican a toda la semana.",
};

interface RulesInput {
	policies: readonly Policy[];
	requestExpiryMinutes: number;
	weekStartDay: number;
}

// The general quota first, then the activities with limits of their own.
function ordered(policies: readonly Policy[]): Policy[] {
	return [...policies].sort(
		(a, b) => Number(a.activityId !== null) - Number(b.activityId !== null),
	);
}

// Every automatic line «Tus reglas» shows before hiding any, once per kind
// (with the text of the first quota that has it).
export function automaticRules(input: RulesInput): RuleLine[] {
	const lines = [
		...ordered(input.policies).flatMap((policy) =>
			rulesFor(policy, input.weekStartDay),
		),
		...fixedRules(input.requestExpiryMinutes),
		WEEK_CHANGE,
	];
	return lines.filter(
		(line, index) =>
			lines.findIndex((other) => other.key === line.key) === index,
	);
}

interface ChildRulesProps extends RulesInput {
	activities: readonly MemberActivity[];
	// Only those written for the child.
	customRules: readonly { id: string; text: string }[];
	hidden: readonly HiddenRuleKey[];
}

// Whether «Tus reglas» has anything to say once the hidden lines are out.
export function hasVisibleRules({
	customRules,
	hidden,
	...input
}: Omit<ChildRulesProps, "activities">): boolean {
	return (
		customRules.length > 0 ||
		automaticRules(input).some((line) => !hidden.includes(line.key))
	);
}

export function ChildRules({
	policies,
	activities,
	customRules,
	hidden,
	requestExpiryMinutes,
	weekStartDay,
}: ChildRulesProps) {
	const shown = (lines: readonly RuleLine[]) =>
		lines.filter((line) => !hidden.includes(line.key));
	const groups = ordered(policies).flatMap((policy) => {
		const lines = shown(rulesFor(policy, weekStartDay));
		return lines.length === 0 ? [] : [{ policy, lines }];
	});
	const fixed = shown(fixedRules(requestExpiryMinutes));
	const footer = shown([WEEK_CHANGE]);
	return (
		<div className="flex flex-col gap-4">
			{groups.map(({ policy, lines }) => {
				const activity = activityById(activities, policy.activityId);
				// The general quota is named after the activities that share it.
				const shared = namesText(
					bagMembers(policy, policies, activities).map((a) => a.name),
				);
				return (
					<div key={policy.id} className="flex flex-col gap-1.5">
						{policies.length > 1 && (
							<p className="font-semibold">
								{activity ? activity.name : shared || "Para todo"}
							</p>
						)}
						<ul className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-faint">
							{lines.map((line) => (
								<li key={line.key}>{line.text}</li>
							))}
						</ul>
					</div>
				);
			})}
			{customRules.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<p className="font-semibold">Acuerdos de la casa</p>
					<ul className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-faint">
						{customRules.map((rule) => (
							<li key={rule.id}>{rule.text}</li>
						))}
					</ul>
				</div>
			)}
			{fixed.length > 0 && (
				<ul className="flex list-disc flex-col gap-1 pl-5 text-ink-soft marker:text-ink-faint">
					{fixed.map((line) => (
						<li key={line.key}>{line.text}</li>
					))}
				</ul>
			)}
			{footer.map((line) => (
				<p key={line.key} className="text-[0.9375rem] text-ink-soft">
					{line.text}
				</p>
			))}
		</div>
	);
}
