---
target: área de padres (/padres, /login, /recuperar)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/freddytacuri/WorkSpace/ownCloud/time-craft/apps/web/src/pages/padres/[...path].astro"
target_fingerprint: "sha256:19ebf4928c38075fa7d8bffdac99d363bddbe7419a86ba1610fa9bad73a011ed"
target_path: /Users/freddytacuri/WorkSpace/ownCloud/time-craft/apps/web/src/pages/padres/[...path].astro
timestamp: 2026-10-19T23-58-04Z
slug: src-pages-padres-path-astro
closed: true
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Numbers disagree (12:59 next to «Lleva 8 min de 20»); «expira en 14:49» reads as a time of day |
| 2 | Match with the real world | 3 | «Cuota general: Juego» is jargon; «Lunes, 19 Oct» capitalised by CSS |
| 3 | User control and freedom | 3 | Push offer cannot be dismissed |
| 4 | Consistency and standards | 2 | Brick grammar contradicts itself (bonus, history, half brick); long pause in red; rounding differs |
| 5 | Error prevention | 3 | Disabled submits hide the reason |
| 6 | Recognition over recall | 3 | Legend below the week wall on phone; Reglas in raw minutes |
| 7 | Flexibility and efficiency | 2 | «no puedes pasarte de eso» dead end; extra time only appears at 0 and nothing says so |
| 8 | Aesthetic and minimalist | 3 | Up to 4 solid primaries per scroll; «Nueva sesión» twice on desktop |
| 9 | Error recovery | 3 | Rate-limit message does not say how long |
| 10 | Help and documentation | 3 | Nothing explains the bonus brick |
| Total | | 28/40 | Good, with consistency faults |

## Design specificity
Bricks are product-specific and carry real information (live-session row, overrun state). Around them the shell is the category default; the manual grammar barely appears beyond Nueva sesión's numbered steps. The brick says the wrong thing in places (bonus bricks read as used, history draws used time solid).
Detector: CLI 1 advisory (bounce-easing, LoadingBricks, ui.tsx). Browser: nested-cards on Segmented (false positive), flat-type-hierarchy on /padres (half false positive; section headings 18px vs body 16px is real), bounce-easing page-wide (deliberate loader, but reads as generic bouncing dots).

## Priority issues
1. [P1] Numbers disagree: NowCard ceil vs countdown floor; stop dialog repeats it; History per-session ceil vs totals floor (21+13≠35). Fix: one rule (floor consumed), totals = sum of shown parts. → harden
2. [P1] Brick grammar contradicts itself: bonus bricks turn to outlines as soon as time is used; History draws used as solid; half brick = 5 min in Bonos but draining elsewhere; bonus snap never fires (new indices). → clarify
3. [P2] Calm broken: long pause paints the card red; request expiry ticks per second. Fix: pause tone orange, red only on Detener; expiry in minutes, seconds only in the last minute. → quieter
4. [P2] Balance ambiguous: «Le quedan 38 min» silently includes the live session; with two bags «Ahora» uses the biggest; jargon labels. → clarify
5. [P2] Too many primaries + permanent push nag («teléfono» on desktop) + duplicate «Nueva sesión» on desktop. → distill

## Persona red flags
- Hurried parent at 360 px: reads expiry as a clock time; red long pause reads as an emergency; Pausar and Detener equal weight in overrun.
- First-time parent: yellow outlines read as "bonus spent"; dead end at «no puedes pasarte de eso»; raw minutes in Reglas.
- Low vision: bonus yellow brick ~1.5:1 on white; disabled buttons do not explain; disabled next-week arrow barely differs.

## Minor observations
- History: «Lunes, 19 Oct» capitalize; today's group should read «Hoy»; green «Completa» next to red «se pasó».
- Scheduled state shows the duration where the countdown goes; show start time big.
- brick-release 420 ms vs 180 ms in the contract.
- Child's IP in devices leans to surveillance.
- Disabled-until-filled submits and Chrome autofill.

## Questions
- If a brick is 10 minutes, why does Reglas take minutes?
- Does a parent need per-second countdown?
- LEGO palette vs the child's Minecraft world for 5b?
