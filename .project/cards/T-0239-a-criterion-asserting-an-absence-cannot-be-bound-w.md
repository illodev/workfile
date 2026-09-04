---
id: T-0239
title: A criterion asserting an absence cannot be bound without inverting it
status: done
type: bug
priority: medium
area: core
source: .project/cards/T-0237-the-protocol-never-says-what-to-do-when-a-turn-end.md
raised: reported
created: 2026-09-03
updated: 2026-09-04
verified:
  at: "2026-09-04T00:09:44.839Z"
  method: manual
  commit: bb54ef2a554c921781bef5fe98e4c2533ac44c65
  digest: "sha256:77ba04a8719fea22695a7c77cf57bb7f73265a864a866e7a3002a3cbc11277c1"
---

`card verify` marks a criterion when its command exits 0, and the commands a project can put behind a binding are searches. **A search exits 0 when it FINDS.** So a criterion that asserts an absence — "the literal is gone", "no caller does this any more" — bound to one marks itself *exactly backwards*: satisfied while the claim is false, and silently.

Measured in a consuming repository: a criterion of that shape was bound to a search, the literal was present in **two files**, and the gate answered `checked #1`. The criterion was then machine-owned, so it could not even be unticked by hand — the binding had to be removed first.

**And there was no way to invert it.** The allowlist requires the command to *start* with a search, and it is spawned without a shell, so there is no `!`, no `;` and no `test $?` to wrap it in. The only advice the protocol could give was "do not bind it", which turns the strongest kind of criterion into one nobody can check.

## What was considered and rejected

A `doctor` rule that flags a negative-sounding criterion bound to a search. **Measured and dropped**: over a 2 373-card board only 10 cards declare `verify` at all, and a negation-marker regex over their criteria returns 12 hits of which most are incidental — "what it does *not* measure", "tools that *cannot* export". A regex cannot tell whether the negation is the subject of the claim or a clause inside it, so the rule would have been noise, and doctor output nobody can act on is output nobody reads.

## Acceptance criteria

- [x] A verify entry can declare `expect: absent`, and is then satisfied when its command exits non-zero.
- [x] `expect` is validated against a closed set, because an unrecognised value would read as "not absent" and silently restore the inversion.
- [x] The polarity is decided in one place, and what gets ticked, what the card's trail says and whether the run is `ok` all read it rather than re-deriving it from the exit code.
- [x] The trail line says what was PROVED, not how the process ended: "grep X passed" on a criterion claiming X is gone reads as the opposite of what happened.
- [x] A test covers both directions: a command finding nothing proves the absence, and one still finding it disproves it.
- [x] The protocol says `expect: absent` exists, so the advice stops being "do not bind it".

## Activity

- 2026-09-03 22:55Z illodev@local#5c0f3978 · backlog → review
- 2026-09-04 00:09Z illodev@local#2a219b74 · review → done

## Notes

- 2026-09-04 00:09Z illodev@local#2a219b74 — 2026-09-04 — **Verificado en un consumidor real, y las dos direcciones se comportan.**

Instalado `@illodev/workfile@0.10.0` desde npm en un directorio limpio, con `cards.verification.commands: [["grep"],["rg"]]` declarado, y una ficha con dos criterios atados a dos `grep` sobre el mismo fichero — uno del literal que SÍ está y otro, con `expect: absent`, del que NO está:

```
PASSED  presente  grep -q PRESENTE muestra/dato.txt  — checked #1
FAILED  ausente   grep -q AUSENTE  muestra/dato.txt  — checked #2   (exit 1)
T-0002 — 2 of 2 met
```

**Los dos criterios quedan marcados**, y el que prueba la ausencia lo hace con el comando saliendo **1**. Ésa es la inversión resuelta: antes, atar «X ya no aparece» a `grep X` lo marcaba justo mientras X seguía ahí.

**Y el criterio #4 se cumple donde importa: en el registro.** La línea que quedó escrita en la ficha dice lo que se PROBÓ, no cómo terminó el proceso:

```
verify ausente: grep -q AUSENTE muestra/dato.txt found nothing, as expected, checked #2
```

Comprobado también el guardarraíl: sin `cards.verification.commands` declarado, `card verify` se niega con `CARD_VERIFY_COMMAND_NOT_ALLOWED` en vez de ejecutar.

**Lo que NO cubre esta ficha, y sale de aquí como ficha aparte:** la CLI imprime `FAILED` y cuenta «1 of 2 entries passed» para esa misma entrada satisfecha, porque lee `entry.outcome` —cómo terminó el proceso— donde el registro lee `satisfied`. El `report.ok` y el código de salida ya son correctos; es sólo lo que ve un humano. Se separa porque los seis criterios de aquí **se entregaron en 0.10.0** y eso se arregla en la siguiente.
- 2026-09-04 00:09Z illodev@local#2a219b74 — manual verification: Consumidor limpio con 0.10.0 de npm: dos criterios atados a grep, uno con expect: absent; los dos marcados, el de la ausencia con el comando saliendo 1, y el trail escribe 'found nothing, as expected'
