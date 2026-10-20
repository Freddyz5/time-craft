---
target: área del niño (/nino, /nino/entrar)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/freddytacuri/WorkSpace/ownCloud/time-craft/apps/web/src/pages/nino/[...path].astro"
target_fingerprint: "sha256:e1f6ab54bf540e540f8e988dd746037fe99f471e202f351aaac8f1f51c9a8475"
target_path: /Users/freddytacuri/WorkSpace/ownCloud/time-craft/apps/web/src/pages/nino/[...path].astro
timestamp: 2026-10-20T02-40-09Z
slug: src-pages-nino-path-astro
closed: true
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | A parent's answer arrives silently (no sound, motion or live region) |
| 2 | Match with the real world | 3 | Adult words leak: «sesión programada», «no se descuenta», «también cuentan», «es obligatorio» |
| 3 | User control and freedom | 3 | Typed extra-time reason lost on tab switch |
| 4 | Consistency and standards | 2 | Brick grammar splits: remainder drains in batteries but is a half in the picker (3 min = half); yellow is «bono» and «ganado»; week bricks half the day's size |
| 5 | Error prevention | 2 | Placeholder reads as typed; no warning before the 15-min lockout; «Gana más con tareas» on an exhausted day |
| 6 | Recognition over recall | 3 | Salir hidden behind the bell |
| 7 | Flexibility and efficiency | 3 | Remembered username, keyboard PIN, one-tap defaults |
| 8 | Aesthetic and minimalist | 3 | Idle Inicio periphery noisy (two legends, 32-brick wall, meter, link, button, offer) |
| 9 | Error recovery | 3 | Wrong-PIN notice shifts the keypad ~50 px |
| 10 | Help and documentation | 2 | Rules never shown as rules, only as fractions |
| Total | | 27/40 | Acceptable |

## Design specificity
Product-specific: battery with terminal, «se recarga», studs on the active tab, parts box, brick picker that lifts. Weak spots: generic white card stacks around the signature (Avisos, history lists, task cards); «larger, less text» only half done (idle hero is a sentence; ~12 text elements in the batteries card).
Detector: CLI exit 0 with 6 advisory design-system-font-size (4.5rem countdowns, 2.5rem lockout, 0.875rem tabs and picker labels, 1.0625rem Entrar key) — the child's scale, undocumented in DESIGN.md. Browser: skipped-heading on Tareas (real: BonusMeter's fixed h3 under the h1); gray-on-color on an approved report (false positive, 7:1); flat-type-hierarchy on Inicio (half false: sr-only h1; hierarchy carried by the 4.5rem figure and bricks).

## Priority issues
1. [P1] During a session the time story contradicts itself: «Te quedan 33 min hoy» next to 28:53; reserved minutes green in Hoy, blue in Ahora; «Se acabó el tiempo» above «Te quedan 32 min hoy». Fix: headline says what is left after the session; reserved bricks in the activity colour; «Se acabó tu sesión de Juego» for the session, «se acabó tu tiempo» only for the bag. → clarify
2. [P1] Exhausted day promises what tasks can't give («Gana más con tareas»; bonuses only add to the week) and its action is off-screen (y=918 at 780). Fix: «Gana minutos para tu semana» + «Las tareas suman a tu semana, no a hoy»; actions right under the headline. → clarify, layout
3. [P2] Approval peak is flat: no brick snap (NowCard mounts fresh, BrickRow never animates first paint), no sound, AnswerCard not a live region. Fix: staggered snap on pending → approved, soft answer tone, polite announcement; no motion for a «no». → animate, delight
4. [P2] Brick and system grammar cracks: 3-min remainder drawn as a half; yellow named twice; week bricks half the day's size and a lopsided last row; skipped heading in Tareas; child type steps undocumented. → polish
5. [P2] Extra-time reason is fragile: placeholder looks typed, red «es obligatorio», lost on tab switch. Fix: reason chips, «Por ejemplo:» placeholder, calm error, keep the draft. → harden

## Persona red flags
- Mateo (9, project persona): two time figures during a session; «Gana más con tareas» on an exhausted day; placeholder looks written; decorative green bricks on the login read as a balance; can re-ask a second after a «no» (form preloaded under the refusal).
- Sam (screen reader): lockout WaitPanel is role=status around a per-second countdown; answers not announced; chosen activity shown only by a heavier border.
- Casey (one-handed): extra-time submit two scrolls down; wrong-PIN notice shifts keys; reason lost on tab switch.

## Minor observations
- «¡Hola, mateo!» echoes the lowercase username; step title «Tu usuario» repeats the label.
- Scheduled title «Más tarde» is vague.
- «Hoy te pasaste 8 min: también cuentan» → «Esos 8 min se restan de tu semana».
- Pedir preselects Juego even when its bag is out and TV has time.
- Overtime alarm toast covers the batteries at 360 px.
- Desktop picker bricks ~180 px wide.
- Out of scope (core): child pushes are third person («Juego de Mateo está por terminar»).

## Questions
- Is a growing red «+0:08» right for a 9-year-old, or a scoreboard to beat?
- Should he be able to re-ask one second after a «no»?
- Would a short «Tus reglas» panel end more arguments than fractions?
