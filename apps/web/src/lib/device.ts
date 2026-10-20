// "Chrome en Android", "Safari en iPhone"…: a readable name for a browser,
// from its user agent. Used to label push subscriptions and the child's
// signed-in devices.
export function labelFromUserAgent(ua: string | null | undefined): string {
	if (!ua) {
		return "Navegador desconocido";
	}
	const browser = /Edg\//.test(ua)
		? "Edge"
		: /SamsungBrowser\//.test(ua)
			? "Samsung Internet"
			: /Firefox\/|FxiOS\//.test(ua)
				? "Firefox"
				: /Chrome\/|CriOS\//.test(ua)
					? "Chrome"
					: /Safari\//.test(ua)
						? "Safari"
						: "Navegador";
	const system = /Android/.test(ua)
		? "Android"
		: /iPhone/.test(ua)
			? "iPhone"
			: /iPad/.test(ua)
				? "iPad"
				: /CrOS/.test(ua)
					? "Chromebook"
					: /Mac OS X|Macintosh/.test(ua)
						? "Mac"
						: /Windows/.test(ua)
							? "Windows"
							: /Linux/.test(ua)
								? "Linux"
								: null;
	return system === null ? browser : `${browser} en ${system}`;
}
