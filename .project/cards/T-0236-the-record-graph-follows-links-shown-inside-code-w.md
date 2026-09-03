---
id: T-0236
title: The record graph follows links shown inside code, which the doc checker masks
status: review
type: bug
priority: low
area: core
origin: [T-0232]
raised: derived
created: 2026-09-03
updated: 2026-09-03
---

`codeMask` exists because a link being *shown* is not a link being *followed*: a template that teaches the house style by printing `` `[texto](categoria/slug)` `` was reported as linking to a category that does not exist — the document doing its job, called broken. `diagnoseDocuments` consults the mask; `markdownDocumentPaths`, which builds the `markdown` relation of the record graph, does not.

So an example link inside a fence becomes a **relationship** between records: a backlink somebody has to explain, and an edge in the graph view that means nothing. `_TEMPLATE.md` teaching a link style ends up related to whatever slug it used as an example.

This surfaced while unifying the two link extractors in T-0232 and was deliberately **not** changed there: sharing the scanner is behaviour-preserving, masking is not, and mixing the two would have made a five-line fix into a graph change nobody asked for.

## What has to be decided, not just implemented

Whether a link inside code is an edge is a real question, not an oversight to correct:

- **Mask it, like the checker.** Consistent, and the argument is the same one that put the mask in the checker. But a body that documents a relationship by quoting it — a card whose whole point is a path, printed in a fence — loses its edge.
- **Keep it, and say so.** The graph is about what a record mentions, and mentioning in a fence is still mentioning. Then the asymmetry is a decision and the docblock says why.

Measuring it is what settles it: count the `markdown` edges that come from inside a code span on a repository with a real corpus, and look at what they are.

## Acceptance criteria

- [x] Measured how many `markdown` edges originate inside code, on a real corpus
- [x] One of the two readings chosen, with the count next to it
- [x] The two extractors' treatment of code is the same, or the difference is written down where both are

## Activity

- 2026-09-03 14:22Z illodev@local#062a7c97 · renumbered from T-0234
- 2026-09-03 15:54Z illodev@local#062a7c97 · backlog → review

## Notes

- 2026-09-03 15:54Z illodev@local#062a7c97 — **Medida y decidida: la asimetría se queda, y ahora es una decisión con número detrás.**

## La medida, sobre 2 700 registros

| | |
| --- | ---: |
| enlaces markdown en total | **1 863** |
| ...dentro de un span o una valla | **17** |
| ...de esos 17, cuántos producen una arista | **0** |

La máscara aquí no cambiaría nada. Cero.

## Y el mecanismo, porque un cero sin explicación es un número esperando a cambiar

Comprobé primero que **la máscara dispara** en este corpus —17, no 0—, porque un cero producido por
un detector apagado se lee igual que un cero real y es el modo de fallo que más veces ha mordido
hoy.

La razón de que ninguno llegue a arista es que **los dos consumidores filtran distinto**:

- una **arista** existe sólo cuando el destino resuelve a **un registro que el índice ya conoce**;
- lo que la gente escribe dentro de una valla es un **placeholder de plantilla**
  (`categoria/sub/nombre-doc`, `slug-canonical-1`, `…`) o una **ruta a código fuente**
  (`../../../apps/api/src/.../LimitReset…`). Ninguna de las dos es un registro.

El **chequeo de enlaces**, en cambio, resuelve contra **ficheros en disco**, así que el
`` `[texto](categoria/slug)` `` de una plantilla sí puede caer sobre una ruta real — que es
exactamente el falso positivo que puso la máscara allí.

## La decisión: opción 2 de la ficha — se queda, y se escribe

Añadir la máscara aquí cambiaría **cero** aristas medidas y costaría el único caso que no sabe
distinguir: un registro que documenta una relación **citando la ruta del otro** en una valla
perdería su arista, en silencio. Cambiar algo por simetría, sin beneficio medido y con un coste
real, es lo contrario de lo que pedía esta ficha.

Queda escrito en el docblock de `markdownDocumentPaths` —con los tres números— y **pinchado por un
test**: `a link quoted inside code still relates two records`. Así, quien quiera unificarlo tiene
que discutir con la medición y no con la simetría. Suite: **501 pass, 0 fail**.

**Salida: `review`.** Los tres criterios cumplidos; falta verlo correr publicado.
