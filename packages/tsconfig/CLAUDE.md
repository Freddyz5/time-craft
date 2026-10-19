# packages/tsconfig

Configuraciones de TypeScript compartidas:

- `base.json`: base estricta (`strict`, `noUncheckedIndexedAccess`, `module: preserve` + `moduleResolution: bundler`, `noEmit`).
- `node.json`: para los paquetes y la api (tipos de Node).
- `astro.json`: para `apps/web` (DOM, JSX de React, tipos generados por Astro).

No debe:

- Contener código ni dependencias.
- Emitir JS: nadie compila con `tsc`. La api se empaqueta con Bun y la web con Astro.
- Subir a TypeScript 7 mientras `@astrojs/check` no lo soporte.
