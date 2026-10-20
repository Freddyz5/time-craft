// What every screen of the child's island reads: the household (/api/me, which
// for the child carries only themselves and the active activities), their id
// and name, the family's time zone and the parents' names (to say who
// answered a request).
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Activity, Household } from "../lib/types";

interface ChildContextValue {
	household: Household;
	childId: string;
	name: string;
	timeZone: string;
	activities: Activity[];
	parentName: (parentId: string | null) => string;
}

const ChildContext = createContext<ChildContextValue | null>(null);

export function ChildProvider({
	household,
	children,
}: {
	household: Household;
	children: ReactNode;
}) {
	const value = useMemo<ChildContextValue>(() => {
		const me = household.me;
		return {
			household,
			childId: me.kind === "child" ? me.childId : "",
			name: me.name,
			timeZone: household.family.timezone,
			activities: household.activities.filter((a) => a.isActive),
			parentName: (parentId) =>
				household.parents.find((p) => p.id === parentId)?.name ?? "Mamá o papá",
		};
	}, [household]);
	return (
		<ChildContext.Provider value={value}>{children}</ChildContext.Provider>
	);
}

export function useChild(): ChildContextValue {
	const value = useContext(ChildContext);
	if (value === null) {
		throw new Error("useChild outside ChildProvider");
	}
	return value;
}
