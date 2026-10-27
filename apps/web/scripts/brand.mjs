// Builds every brand file from the mark (brand/mark.svg): the logo with the
// name beside it, for light and dark grounds, the favicons and the app icons.
// Run it after changing the mark (`bun run brand`); the outputs are committed.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import opentype from "opentype.js";

const root = new URL("../", import.meta.url);
const at = (path) => new URL(path, root);

const INK = "#171a20";
const INK_ON_DARK = "#f5f6f8";
// The dark baseplate the app icon sits on, with its studs.
const PLATE = "#1b1e24";
const PLATE_STUD = "#272b33";
const PLATE_STUD_TOP = "#2e333c";

const mark = await readFile(at("brand/mark.svg"), "utf8");
// The mark's drawing without its <svg> wrapper and title, to place it inside
// other drawings.
const markBody = mark
	.replace(/^[\s\S]*?<svg[^>]*>/, "")
	.replace(/<\/svg>\s*$/, "")
	.replace(/\s*<title>[\s\S]*?<\/title>/, "")
	.trim();

// The name, outlined from Baloo 2 ExtraBold: the logo works without the font.
const require = createRequire(import.meta.url);
const fontFile = require
	.resolve("@fontsource/baloo-2/package.json")
	.replace("package.json", "files/baloo-2-latin-800-normal.woff");
const fontData = await readFile(fontFile);
const font = opentype.parse(
	fontData.buffer.slice(
		fontData.byteOffset,
		fontData.byteOffset + fontData.byteLength,
	),
);

// opentype.js 2.0's own toPathData() writes NaN into some curves, so the
// outline is written from the path's commands.
function pathData(path) {
	const n = (value) => Number(value.toFixed(2));
	return path.commands
		.map((c) => {
			switch (c.type) {
				case "M":
				case "L":
					return `${c.type}${n(c.x)} ${n(c.y)}`;
				case "Q":
					return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
				case "C":
					return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
				default:
					return "Z";
			}
		})
		.join("");
}

function lockup(textColor) {
	const size = 34;
	const probe = font.getPath("Time Craft", 0, 0, size).getBoundingBox();
	// Centre the name on the brick's face (y 10 to 45 in the mark).
	const baseline = 27.5 - (probe.y1 + probe.y2) / 2;
	const x = 60;
	const path = font.getPath("Time Craft", x, baseline, size);
	const width = Math.ceil(x + probe.x2 + 2);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 48">
	<title>Time Craft</title>
	${markBody.replaceAll("\n", "\n\t")}
	<path d="${pathData(path)}" fill="${textColor}"/>
</svg>
`;
}

// The app icon: the mark on a dark baseplate, full bleed (launchers and iOS
// round the corners themselves). A maskable icon keeps the mark inside the
// safe circle.
function appIcon({ maskable = false } = {}) {
	const markSize = maskable ? 32 : 40;
	const offset = (64 - markSize) / 2;
	const scale = markSize / 48;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
	<title>Time Craft</title>
	<defs>
		<pattern id="studs" width="8" height="8" patternUnits="userSpaceOnUse">
			<circle cx="4" cy="4" r="2.7" fill="${PLATE_STUD}"/>
			<circle cx="4" cy="3.6" r="1.8" fill="${PLATE_STUD_TOP}"/>
		</pattern>
	</defs>
	<rect width="64" height="64" fill="${PLATE}"/>
	<rect width="64" height="64" fill="url(#studs)"/>
	<g transform="translate(${offset} ${offset + 1}) scale(${scale})">
		${markBody.replaceAll("\n", "\n\t\t")}
	</g>
</svg>
`;
}

// Android shows a notification's badge as a one-colour silhouette: the brick
// in white with the clock hand cut out.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 60 60">
	<defs>
		<mask id="hand">
			<rect x="-6" y="-6" width="60" height="60" fill="#fff"/>
			<path d="M24 18.5v9.5l6.5 3.5" fill="none" stroke="#000" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
		</mask>
	</defs>
	<g fill="#fff" mask="url(#hand)">
		<rect x="9" y="3" width="12" height="10" rx="3"/>
		<rect x="27" y="3" width="12" height="10" rx="3"/>
		<rect x="2" y="10" width="44" height="35" rx="5"/>
	</g>
</svg>
`;

function png(svg, size) {
	return new Resvg(svg, { fitTo: { mode: "width", value: size } })
		.render()
		.asPng();
}

// An .ico holding PNG images (every browser since IE Vista reads them).
function ico(images) {
	const header = Buffer.alloc(6 + images.length * 16);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	images.forEach(({ size, data }, index) => {
		const entry = 6 + index * 16;
		header.writeUInt8(size >= 256 ? 0 : size, entry);
		header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
		header.writeUInt8(0, entry + 2);
		header.writeUInt8(0, entry + 3);
		header.writeUInt16LE(1, entry + 4);
		header.writeUInt16LE(32, entry + 6);
		header.writeUInt32LE(data.length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += data.length;
	});
	return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

const icon = appIcon();
const maskable = appIcon({ maskable: true });

const outputs = {
	"brand/logo.svg": lockup(INK),
	"brand/logo-dark.svg": lockup(INK_ON_DARK),
	"public/favicon.svg": mark,
	"public/favicon.ico": ico(
		[16, 32, 48].map((size) => ({ size, data: png(mark, size) })),
	),
	"public/icons/icon.svg": icon,
	"public/icons/icon-192.png": png(icon, 192),
	"public/icons/icon-512.png": png(icon, 512),
	"public/icons/icon-maskable-512.png": png(maskable, 512),
	"public/icons/apple-touch-icon.png": png(icon, 180),
	"public/icons/badge-96.png": png(badge, 96),
};

for (const [path, data] of Object.entries(outputs)) {
	await writeFile(at(path), data);
	console.log(`brand: ${path}`);
}
