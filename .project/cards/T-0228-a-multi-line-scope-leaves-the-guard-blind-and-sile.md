---
id: T-0228
title: A multi-line scope leaves the guard blind and silent
status: review
type: bug
priority: medium
area: core
raised: derived
origin: [T-0225]
created: 2026-09-02
updated: 2026-09-04
scope: [packages/workfile/src/runtime/claude, packages/workfile/test]
---

`frontmatterOf` in the Claude hook runtime splits frontmatter line by line with
`^([A-Za-z_][\w.-]*):\s*(.*)$` and only understands a `[...]` sequence closed on the **same line**.

A card whose `scope:` is written any other way therefore reaches the guard with **no usable scope**,
and the guard goes blind for that card **without saying anything**.

## Measured

Case 14 of the Fube bench `scripts/workfile-guard-cases.mjs`, driving the real `session-start` and
`pre-tool-use` against synthetic cards in a throwaway workspace:

| how `scope:` is written | scope the hook reads | guard |
| --- | --- | --- |
| flow sequence, one line (control) | `["scripts/uno.mjs","scripts/dos.mjs"]` | asks — correct |
| block sequence (`scope:` + `-` items below) | `[]` | **silent** |
| flow sequence split across lines | `["["]` | **silent** |

The third is the nastier of the two: the scope is not empty, it holds one entry that matches
nothing, so anything looking at it sees a scope and believes it.

## Why this is not hypothetical

Both shapes are what a formatter produces. `T-2207` in the Fube board documents 135 of 1 811 cards
already split that way by prettier at `printWidth 80`. Any pass by a formatter that does not honour
`.prettierignore` — a format-on-save from another editor, another repo consuming the package, an
agent tidying up — turns a protected card into an unprotected one, silently.

## The fix

Teach `frontmatterOf` the block sequence and the multi-line flow sequence, which the package codec
already handles elsewhere; the hook duplicates the parser deliberately (it imports nothing), so the
two have drifted. Add the split-scope card as a bench case: today nothing pins it.

Cheap interim alternative, if the parser stays as it is: a `doctor` finding for any card whose
`scope:` is not on one line — so the blindness at least becomes visible.

## This is the half [[T-0225]] left behind

`T-0225` is the same shape, one layer down, and it is already `review`: a re-wrapped flow sequence
made a card **unclaimable**, because `scanEntries` called it `opaque` and `patchFrontmatter` refused
to write `scope`. That was fixed in the **codec** — `readFlowSequence` joins the continuation lines
and parses them through the same `splitListItems`/`unquote` path.

The hook was not. `frontmatterOf` (`hooks.mjs:48-66`) is a **deliberate duplicate** — that file
imports nothing from the package, by design — and it still only accepts a `[...]` that opens and
closes on one line. So after T-0225 the card can be claimed again, and the guard still cannot see
its scope.

That makes this the more dangerous of the two: T-0225 failed **loudly**, on the first command of the
protocol. This one fails silently, and looks like protection.

The two parsers are already pinned to each other elsewhere by test; the reading of a list key should
be pinned too, or the drift just recurs.

## Acceptance criteria

- [x] A `scope` written as a block sequence reaches the guard whole
- [x] A `scope` a formatter re-wrapped across lines reaches it whole, with the bracket opening on the key's line or on its own
- [x] A sequence that never closes leaves the key unset rather than one entry matching nothing, and every key written after it is still read
- [x] A `verify` block under the key is not swallowed, because it is a list of mappings and eating it would hide the keys inside
- [x] A test drives the real hook end to end for each shape and asserts the guard asks on an edit inside the recovered scope

## Activity

- 2026-09-04 00:19Z illodev@local#2a219b74 · claimed
- 2026-09-04 00:23Z illodev@local#2a219b74 · doing → review

## Notes

- 2026-09-04 00:23Z illodev@local#2a219b74 — 2026-09-04 — **Arreglado en el parser, no con un aviso del doctor.**

La ficha proponía como alternativa barata un hallazgo del `doctor` para cualquier `scope:` que no estuviera en una línea. No hacía falta: enseñarle las formas al parser es del mismo tamaño y **elimina** el problema en vez de hacerlo visible.

## Las cuatro formas, medidas una a una

| cómo está escrito el `scope:` | antes | ahora |
| --- | --- | --- |
| secuencia de flujo en una línea | `["src/api","src/billing"]` | igual |
| secuencia de bloque (`- item` debajo) | `[]` — **guard ciego** | `["src/api","src/billing"]` |
| flujo repartido, corchete en la línea de la clave | `["["]` — **peor: parece un scope** | `["src/api","src/billing"]` |
| flujo repartido, corchete en su propia línea | `""` → `[]` | `["src/api","src/billing"]` |

La cuarta forma **no estaba en la ficha** y apareció al escribir el test: mi primera versión del arreglo la seguía leyendo mal, porque sólo miraba el corchete en la línea de la clave. Es la que produce prettier con `printWidth` corto.

## Dos cosas que el arreglo hace a propósito

**Una secuencia sin cerrar deja la clave sin poner**, en vez de darle una entrada que no casa con nada. Es peor un scope falso que ninguno: cualquiera que lo lea se lo cree. Y el cursor no avanza, así que **las claves escritas después se siguen leyendo** — comprobado: con un `scope:` roto, `status` sigue llegando.

**Un `verify:` debajo no se lo traga.** Es una lista de mapas, y comerse sus `- id: …` habría consumido las claves de dentro y ocultado lo que viniera detrás. El parser exige que los ítems de una secuencia de bloque sean escalares planos.

## Prueba

`packages/workfile/test/claude-surface.test.ts` — un caso que, por cada forma, monta un workspace, reclama con `scope` en una línea, **lo reescribe a la forma bajo prueba como haría un format-on-save**, corre el `session-start` real y comprueba dos cosas: que el scope llega entero al `board.json` y que el guard **pregunta** en una edición dentro de él. No basta con parsear: hace falta que el guard actúe.

Suite entera: **517 tests, 0 fallos**. Y el plugin regenerado (`node scripts/build-plugin.ts`), porque lleva una segunda copia del runtime y su test lo pilló.

**Lo que queda fuera y es de Fube, no de aquí:** añadir la forma nueva —el corchete en su propia línea— al banco `scripts/workfile-guard-cases.mjs`. Allí los casos 14b y 14c ya cubren las otras dos.

Queda en `review`: está en el árbol y probado, pero no publicado.
