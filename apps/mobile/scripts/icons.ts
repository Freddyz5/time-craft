// Builds the Android app's icons from the web's brand files (apps/web/brand
// and public/icons): the launcher icon, its adaptive foreground and the
// notification's silhouette. «Time Craft Dev» (the dev flavor, src/dev/res)
// gets its own: the mark over a blue plate with «DEV» under it. Run it after
// changing the mark (`bun run icons`); the outputs are committed.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";

const web = new URL("../../web/", import.meta.url);
const src = new URL("../android/app/src/", import.meta.url);

// Launcher icon sizes (48 dp) and adaptive layer sizes (108 dp) per density.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// The dev app's plate: the web's --color-game, which the yellow mark stands
// out on.
const DEV_PLATE = "#2468D6";

function png(svg: string, size: number): Uint8Array {
	return new Resvg(svg, { fitTo: { mode: "width", value: size } })
		.render()
		.asPng();
}

async function writeLauncher(
	res: URL,
	launcherSvg: string,
	foregroundSvg: string,
) {
	for (const [density, factor] of Object.entries(DENSITIES)) {
		const dir = new URL(`mipmap-${density}/`, res);
		await mkdir(dir, { recursive: true });
		const launcher = png(launcherSvg, Math.round(48 * factor));
		await writeFile(new URL("ic_launcher.png", dir), launcher);
		await writeFile(new URL("ic_launcher_round.png", dir), launcher);
		await writeFile(
			new URL("ic_launcher_foreground.png", dir),
			png(foregroundSvg, Math.round(108 * factor)),
		);
	}
}

const icon = await readFile(new URL("public/icons/icon.svg", web), "utf8");
const mark = await readFile(new URL("brand/mark.svg", web), "utf8");
const markBody = mark
	.replace(/^[\s\S]*?<svg[^>]*>/, "")
	.replace(/<\/svg>\s*$/, "")
	.replace(/\s*<title>[\s\S]*?<\/title>/, "")
	.trim();
const markViewBox = /viewBox="([^"]+)"/.exec(mark)?.[1] ?? "0 0 512 512";
const [, , markWidth = 512, markHeight = 512] = markViewBox
	.split(/\s+/)
	.map(Number);

// The mark, `size` units wide, with its top left corner at (x, y).
function placedMark(size: number, x: number, y: number): string {
	const scale = size / Math.max(markWidth, markHeight);
	return `<g transform="translate(${x} ${y}) scale(${scale})">${markBody}</g>`;
}

// The adaptive icon's foreground: the mark inside the 66 dp safe circle of a
// 108 dp layer; the launcher draws the plate color behind it.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${placedMark(60, 24, 24)}</svg>`;
const main = new URL("main/res/", src);
await writeLauncher(main, icon, foreground);

// The dev app: a smaller mark with «DEV» in block letters under it (paths,
// not text, so no font is needed), both inside the safe circle.
const devLetters = `<g transform="translate(37.5 68)" fill="#fff" fill-rule="evenodd">
	<path d="M0 0h5a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H0zM3 3v6h2a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z"/>
	<path d="M12 0h9v3h-6v1.5h5v3h-5V9h6v3h-9z"/>
	<path d="M24 0h3l1.5 7.5L30 0h3l-3 12h-3z"/>
</g>`;
const devContent = `${placedMark(40, 34, 25)}${devLetters}`;
const devForeground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${devContent}</svg>`;
// Without adaptive icons (not used from Android 8, the app's minimum): the
// visible 72 dp of the layers.
const devLauncher = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><rect x="18" y="18" width="72" height="72" fill="${DEV_PLATE}"/>${devContent}</svg>`;
const dev = new URL("dev/res/", src);
await writeLauncher(dev, devLauncher, devForeground);
await mkdir(new URL("values/", dev), { recursive: true });
await writeFile(
	new URL("values/ic_launcher_background.xml", dev),
	`<?xml version="1.0" encoding="utf-8"?>
<!-- Written by scripts/icons.ts: the dev app's plate. -->
<resources>
    <color name="ic_launcher_background">${DEV_PLATE}</color>
</resources>
`,
);

// The notification's small icon: the web push badge (white on transparent),
// 24 dp at xxxhdpi; Android scales it for the other densities. Same for both
// apps.
const drawable = new URL("drawable-xxxhdpi/", main);
await mkdir(drawable, { recursive: true });
await copyFile(
	new URL("public/icons/badge-96.png", web),
	new URL("ic_stat_timecraft.png", drawable),
);
console.log("Icons written to android/app/src/main/res and src/dev/res");
