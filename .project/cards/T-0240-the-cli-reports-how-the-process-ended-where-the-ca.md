---
id: T-0240
title: The CLI reports how the process ended where the card reports what it proved
status: review
type: bug
priority: medium
area: core
source: .project/cards/T-0239-a-criterion-asserting-an-absence-cannot-be-bound-w.md
tags: [verify, cli, polarity]
origin: [T-0239]
raised: derived
created: 2026-09-04
updated: 2026-09-04
scope: [packages/workfile/bin/workfile.ts, packages/workfile/src/modules/cards/changed.ts, packages/workfile/test]
---

T-0239 gave a verify entry `expect: absent`, and decided the polarity in one place so that what gets ticked and what the trail says both read it instead of re-deriving it from the exit code. **The trail obeys. The console does not.**

Measured on 2026-09-04 in a clean consumer with `@illodev/workfile@0.10.0` installed from npm, on a card with one ordinary entry and one `expect: absent` entry:

```
T-0002 — 1 of 2 entries passed
  PASSED    presente (0.0s) grep -q PRESENTE muestra/dato.txt — checked #1
  FAILED    ausente (0.0s, exit 1) grep -q AUSENTE muestra/dato.txt — checked #2
T-0002 — 2 of 2 met
```

The same line says **FAILED** and **checked #2**. And the header says one of two entries passed on a run where both criteria were proved and `process.exitCode` was 0.

What the card got is right:

```
verify ausente: grep -q AUSENTE muestra/dato.txt found nothing, as expected, checked #2
```

## Why it is not cosmetic

The durable record is read later, by someone reconstructing what happened. The console is read **now**, by the person or agent deciding whether the run went well — and a run that proved everything it set out to prove announces itself as a partial failure. The exit code is already correct, so nothing automated breaks; what breaks is the human, who re-runs the command by hand, or worse, treats the red as real and reopens a card that was closed correctly.

It is the same class the trail was fixed for, on the surface nobody re-read after fixing it.

## Where

`packages/workfile/bin/workfile.ts`, four reads of `entry.outcome` that should be `entry.satisfied`:

| line | what it does today |
| --- | --- |
| `describeVerifyEntry` | prints `entry.outcome.toUpperCase()` — `FAILED` for a satisfied entry |
| the `why` clause | shows `exit 1` as if it were the problem, when it is the proof |
| the header count | `entries.filter(e => e.outcome === "passed")` |
| the output dump | `if (entry.outcome === "passed") continue` dumps a satisfied entry's (empty) output |

`runner.ts` already exposes `satisfied` per entry and `report.ok` already uses it, which is why the exit code is right. `changed.ts:217` carries the same shape and wants checking.

## Why this is a separate card and not part of T-0239

T-0239's six criteria **shipped in 0.10.0** and were verified there. A card has to stay closeable against the thing that shipped; folding a later fix into it would make it uncloseable against the release it was delivered in. That is the reason to split — not scope, and not subject, which are the same.

## Acceptance criteria

- [x] `card verify` on a satisfied `expect: absent` entry prints a verdict that says it was proved, not `FAILED`
- [x] The header counts entries that were satisfied, so a run where everything was proved reads as whole
- [x] The exit code and `report.ok` are unchanged, because they were already right
- [x] A test covers the rendering of a satisfied absent entry, so the console cannot drift back to the exit code
- [x] `changed.ts` is checked for the same shape, and either fixed or recorded as correct with the reason

## Activity

- 2026-09-04 00:10Z illodev@local#2a219b74 · claimed
- 2026-09-04 00:14Z illodev@local#2a219b74 · doing → review

## Notes

- 2026-09-04 00:14Z illodev@local#2a219b74 — 2026-09-04 — **Arreglado, y con el antes y el después medidos sobre el mismo caso.**

```
antes  T-0002 — 1 of 2 entries passed
         FAILED  ausente (0.0s, exit 1) grep -q AUSENTE muestra/dato.txt — checked #2
ahora  T-0002 — 2 of 2 entries proved
         PASSED  ausente (0.0s, found nothing, as expected) grep -q AUSENTE muestra/dato.txt
```

El «antes» no es una reconstrucción: es la salida de `@illodev/workfile@0.10.0` instalada desde npm en un consumidor limpio, que es donde apareció el defecto.

## Los tres sitios

| dónde | leía | lee |
| --- | --- | --- |
| el veredicto de cada línea | `entry.outcome.toUpperCase()` | `entry.satisfied`, con el crudo sólo cuando no hubo veredicto (timeout, error) |
| la cabecera | `filter(e => e.outcome === "passed")` | `filter(e => e.satisfied)`, y dice **proved** en vez de **passed** |
| el volcado de salida | `if (entry.outcome === "passed") continue` | `if (entry.satisfied) continue` |

Y el código de salida no se ha tocado: **ya era correcto**, porque `report.ok` lee `satisfied` desde T-0239. Lo único que estaba invertido era lo que ve una persona.

**Además el exit 1 ahora se explica en vez de presentarse como el problema** — «found nothing, as expected» —, que es lo que evita que quien corra el `grep` a mano y obtenga 1 deje de creerse la línea que acaba de decirle que pasó.

## El criterio 5: `changed.ts` está BIEN, y por qué

Su `entry.outcome === "passed" || entry.outcome === "failed"` no pregunta «¿salió bien?» sino **«¿llegó a haber veredicto?»**, para distinguir un comando que decidió de uno que expiró. Y el resultado de la ficha lo saca de `report.ok`, que ya lee `satisfied`. No se toca. Queda escrito aquí para que la próxima lectura no lo cambie creyendo que es el mismo fallo.

## Prueba

`packages/workfile/test/cli.test.ts`, un caso nuevo que corre la CLI de verdad contra un workspace temporal con las dos polaridades. Afirma que la línea de la ausencia **no** dice `FAILED`, que dice `found nothing, as expected`, que la cabecera cuenta 2 de 2, y que la ficha sigue escribiendo lo suyo. Con el código de antes fallaba en las dos primeras — la salida de arriba lo demuestra.

Suite entera: **516 tests, 0 fallos, exit 0**.

## Por qué queda en `review` y no en `done`

El arreglo está en el árbol y probado, pero **no publicado**. El estándar que he usado toda la sesión es que `done` exige el artefacto publicado corriendo en un consumidor, y eso llega con la siguiente versión.
