// The landing's way in: "Entrar" for a visitor; for someone already signed
// in, a shortcut to their own side (parents to /padres, the child to /nino).
// The Android app opens on the landing: it goes straight on to that side, or
// to the login this phone used last.
import { useEffect, useState } from "react";
import { buttonClass } from "../components/ui";
import { api, call } from "../lib/api";
import { homeFor } from "../lib/guard";
import { isNativeApp, lastArea } from "../lib/native";

export default function HomeShortcut() {
	const [home, setHome] = useState<string | null>(null);
	useEffect(() => {
		const app = isNativeApp();
		call(api.me.$get())
			.then((household) => {
				const target = homeFor(household.me.kind);
				if (app) {
					window.location.replace(target);
				}
				setHome(target);
			})
			// Signed out (or offline): "Entrar" stays.
			.catch(() => {
				if (app) {
					window.location.replace(
						lastArea() === "child" ? "/nino/entrar" : "/login",
					);
				}
			});
	}, []);
	return (
		<a href={home ?? "/login"} className={buttonClass("primary", "sm")}>
			{home === null ? "Entrar" : "Ir a mi inicio"}
		</a>
	);
}
