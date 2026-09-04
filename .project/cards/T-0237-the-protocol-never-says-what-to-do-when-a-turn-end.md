---
id: T-0237
title: The protocol never says what to do when a turn ends with work still inside
status: done
type: task
priority: high
area: core
raised: reported
created: 2026-09-03
updated: 2026-09-04
verified:
  at: "2026-09-04T00:09:28.777Z"
  method: manual
  commit: bb54ef2a554c921781bef5fe98e4c2533ac44c65
  digest: "sha256:921b10de8d2727e37dbb4d33ea5447d5fd9376624a3f0a39aa4e9423c5ddeede"
---

The shipped protocol defines `review` as "implementation finished, awaiting verification, deployment or approval" and tells an agent to keep the card there "if verification or deployment is pending". **It never says what to do when the turn ends with work still inside the card**, so both outcomes are written with the same word.

Measured in a consuming repository on 2026-09-03: **181 of 249 cards in `review`** had been put there by automated agents, with a **seven-minute median between claim and review**. The work was not bad. The protocol gave "I finished" and "I stopped" the same state, and telling them apart afterwards cost an audit of the whole board.

Six more gaps came out of the same session, all of them shapes an agent cannot infer from the board:

| Gap | What it costs |
| --- | --- |
| `blocked` is defined but nothing routes work to it | a card waiting on somebody else sits in `next` looking startable; the next agent opens it, finds nothing to do, and puts it back |
| Acceptance criteria are mentioned twice, in passing | the heading `card ac` reads is load-bearing and unnamed; five of ten cards worked that day had at least one criterion the gate could not use |
| Nothing says what to do with a criterion whose premise turned out false | it stays `- [ ]` forever, the card becomes uncloseable, and the dead finding stays on the board |
| The verify polarity trap is undocumented | a search exits 0 **when it finds**, so an absence bound to one marks itself backwards, silently |
| `discovered-work` pushes toward carding with no counterweight | measured: seven open cards for one job, each a smaller remainder of the last |
| A reason passed where nothing was forced is dropped in silence | `claim --reason` is required and persisted; the same flag elsewhere is read only with `--force` |

## Acceptance criteria

- [x] The protocol names two exits, says `review` is not "my turn ended", and says where the reason keeps.
- [x] `blocked` is described as waiting on a hand that is not yours, not only as "externally blocked".
- [x] The protocol has an acceptance-criteria section covering the heading, checkboxes being only for criteria, one claim per criterion, and a false premise being rewritten with its measurement.
- [x] The verify polarity trap is written down where a criterion gets bound.
- [x] `While working` and `discovered-work` carry the counterweight: finish it when it is the same file and the same run, and a batch that advances updates its own card.
- [x] A test fails if any of those rules is dropped from the generated surfaces.
- [x] `doctor` reports a card in `review` with not one criterion met, and stays quiet on the partial ones.
- [x] A reason handed to a write that would drop it is refused, and names the door that keeps it.

## Activity

- 2026-09-03 22:50Z illodev@local#5c0f3978 · backlog → review
- 2026-09-04 00:09Z illodev@local#2a219b74 · review → done

## Notes

- 2026-09-04 00:09Z illodev@local#2a219b74 — 2026-09-04 — **Verificado en un consumidor real con el paquete publicado.** Instalado `@illodev/workfile@0.10.0` desde el registro en un directorio limpio, `workfile init`, y comprobado sobre lo que renderiza:

- El protocolo sale con `version=0.10.0` en el marcador y trae las cinco reglas: las dos salidas, `review` no significa «se me acabó el turno», la tanda que avanza actualiza su ficha, terminarlo antes de cardearlo, y `blocked` descrito como esperar una mano que no es la tuya.
- **#7 medido en sus dos mitades**: una ficha en `review` con 0 de 2 criterios dispara `review-with-nothing-met` con el texto entero; al marcar 1 de 2, el doctor **se calla** (0 avisos de esa clase). Las dos direcciones, no sólo la que salta.
- **#8 medido**: `card transition T-0001 next --reason "…"` sin `--force` responde `CARD_REASON_NOT_RECORDED` y nombra la puerta que sí guarda: `card note`.

Consumidor: instalación limpia desde npm, no el árbol de desarrollo.
- 2026-09-04 00:09Z illodev@local#2a219b74 — manual verification: Consumidor limpio con @illodev/workfile@0.10.0 de npm: protocolo renderizado con las cinco reglas y version=0.10.0; review-with-nothing-met salta con 0 de 2 y calla con 1 de 2; CARD_REASON_NOT_RECORDED nombra card note
