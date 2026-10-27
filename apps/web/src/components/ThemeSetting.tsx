// The theme of this device: follow the system's, or pin light or dark.
import { type ThemeChoice, useThemeChoice } from "../lib/theme";
import { Segmented } from "./ui";

const OPTIONS = [
	{ value: "system", label: "Automático" },
	{ value: "light", label: "Claro" },
	{ value: "dark", label: "Oscuro" },
] as const satisfies readonly { value: ThemeChoice; label: string }[];

export function ThemeSetting() {
	const [choice, setChoice] = useThemeChoice();
	return (
		<Segmented
			value={choice}
			onChange={setChoice}
			options={OPTIONS}
			label="Tema"
		/>
	);
}
