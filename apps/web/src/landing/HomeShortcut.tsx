// The landing's way in: "Entrar" for a visitor; for someone already signed
// in, a shortcut to their own side (parents to /padres, the child to /nino).
import { useEffect, useState } from "react";
import { buttonClass } from "../components/ui";
import { api, call } from "../lib/api";
import { homeFor } from "../lib/guard";

export default function HomeShortcut() {
	const [home, setHome] = useState<string | null>(null);
	useEffect(() => {
		call(api.me.$get())
			.then((household) => setHome(homeFor(household.me.kind)))
			// Signed out (or offline): "Entrar" stays.
			.catch(() => undefined);
	}, []);
	return (
		<a href={home ?? "/login"} className={buttonClass("primary", "sm")}>
			{home === null ? "Entrar" : "Ir a mi inicio"}
		</a>
	);
}
