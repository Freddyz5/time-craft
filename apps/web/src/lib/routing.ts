// /padres/reglas/ and /padres/reglas are the same screen (and so are
// /nino/pedir/ and /nino/pedir). Runs before an island's router reads the
// location; the islands only render in the browser.
export function dropTrailingSlash(base: string): void {
	const { pathname, search, hash } = window.location;
	if (pathname.length > base.length + 1 && pathname.endsWith("/")) {
		window.history.replaceState(
			null,
			"",
			`${pathname.slice(0, -1)}${search}${hash}`,
		);
	}
}
