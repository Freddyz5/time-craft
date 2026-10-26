// What every parents' screen reads: the household (/api/me) and the child
// being looked at. A family usually has one child; with more, the header
// offers a switch and the choice is remembered on this device.
import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import type { Activity, Household, HouseholdChild } from "../lib/types";

interface ParentsContextValue {
	household: Household;
	parentId: string;
	parentName: string;
	timeZone: string;
	child: HouseholdChild | undefined;
	setChildId: (id: string) => void;
	activities: Activity[];
	activeActivities: Activity[];
}

const ParentsContext = createContext<ParentsContextValue | null>(null);

const STORAGE_KEY = "timecraft:child";

function storedChildId(): string | null {
	try {
		return window.localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

export function ParentsProvider({
	household,
	children,
}: {
	household: Household;
	children: ReactNode;
}) {
	const [chosen, setChosen] = useState<string | null>(storedChildId);
	const value = useMemo<ParentsContextValue>(() => {
		const me = household.me;
		const child =
			household.children.find((c) => c.id === chosen) ?? household.children[0];
		return {
			household,
			parentId: me.kind === "parent" ? me.parentId : "",
			parentName: me.name,
			timeZone: household.family.timezone,
			child,
			setChildId: (id: string) => {
				setChosen(id);
				try {
					window.localStorage.setItem(STORAGE_KEY, id);
				} catch {
					// Private mode: the choice lasts for this visit only.
				}
			},
			activities: household.activities,
			activeActivities: household.activities.filter((a) => a.isActive),
		};
	}, [household, chosen]);
	return (
		<ParentsContext.Provider value={value}>{children}</ParentsContext.Provider>
	);
}

export function useParents(): ParentsContextValue {
	const value = useContext(ParentsContext);
	if (value === null) {
		throw new Error("useParents outside ParentsProvider");
	}
	return value;
}

export function parentName(
	household: Household,
	parentId: string | null,
): string {
	if (parentId === null) {
		return "el sistema";
	}
	return household.parents.find((p) => p.id === parentId)?.name ?? "otro padre";
}
