---
id: T-0233
title: doctor --fix cannot be scoped, and its own warning recommends it
status: review
type: bug
priority: medium
area: core
raised: reported
created: 2026-09-02
updated: 2026-09-03
---

`doctor --fix` renames every record whose filename no longer matches its title, across the whole
repository, and there is no way to narrow it. Reported before from fube-v2; this adds the two things
that make it worse than "missing a flag".

## 1. The warning recommends the command

Every `filename-stale` warning ends with:

```
Filename no longer matches the title; `doctor --fix` renames it to <name>
```

In fube-v2 that message is printed **67 times per run**. The project's own rules forbid the command
outright — eight agents work the repository concurrently and on 2026-08-27 one of them ran it for a
card of theirs and moved **63 belonging to other sessions**, all mid-retitle and uncommitted. So the
tool prints, sixty-seven times a day, an instruction the project has banned.

A `--only <id>` (or honouring `--dry-run`, which it currently ignores) would make the advice
followable. `reslugStaleRecordFiles` already filters by `kinds`, so an id filter is the same place.

## 2. Renaming silently breaks path references, and nothing warns

Records link by id (`[[T-1234]]`), which survives a rename. But `source:` fields and many document
links cite the **path**. Measured in fube-v2 on 2026-09-02, on the first stale record in the list:

> Renaming `ADR-0001` would break **9 references** to the old filename — two of them inside a
> read-only imported tree, so unfixable.

`--fix` would move all 67 and say nothing about any of it. Whatever scoping lands, the honest
behaviour is to **report the references before moving**, because the right answer is often *do not
rename*: a stale filename is cheaper than nine dead links.

A local wrapper now does this a record at a time (`scripts/ops/workfile-rename.sh`): it reads the
destination out of doctor's own message, refuses when the old basename is cited anywhere, and moves
with `git mv`. That it had to be written outside is the report.

## Acceptance criteria

- [x] `doctor --fix` can be limited to one or more ids
- [x] `doctor --fix --dry-run` prints the `from → to` list without writing
- [x] Before renaming, references to the old filename are reported
- [x] The `filename-stale` message does not recommend a repository-wide rewrite as the only remedy

## Notes

- 2026-09-03 15:11Z illodev@local#062a7c97 — **Dos de los cuatro criterios cerrados; los otros dos siguen abiertos y la ficha se queda en `next`.**

**#1 — `--fix` acotable: ya estaba**, en `032b306`. `doctor --fix --only T-0042,T-0043` existe y sale en `--help`. La ficha no lo reflejaba.

**#4 — el mensaje: hecho ahora, y era el criterio que más valía.** Decía «`doctor --fix` renames it to X», que se lee como el remedio para el registro del que habla y no lo es: `--fix` renombra **todos** los ficheros del workspace cuyo nombre no case con su título. En el repositorio que lo reportó, con siete agentes más editando fichas, alguien lo corrió **porque esta línea se lo recomendaba** y movió **63 registros ajenos** — algunos retitulados y sin commitear, que es el caso en el que el renombrado no se recupera de git. Un aviso que nombra un barrido de todo el repositorio como el arreglo de un registro no es un consejo: es una trampa con voz amable.

Ahora dice:

```
Filename no longer matches the title; `doctor --fix --only ADR-0001` renames it to
ADR-0001-….md. Plain `--fix` renames every stale filename in the workspace, which
is rarely what one warning calls for
```

Y va **pinchado por nombre** en `cli.test.ts` —`/doctor --fix --only T-0001/` y la frase del `--fix` a secas—, porque todo el valor está en que el flag aparezca: quien lee el aviso es exactamente quien lo necesita, y no va a ir a buscar en `--help` una forma más estrecha que no tiene motivo para sospechar que existe. Suite: 500 pass, 0 fail.

**Lo que queda, y por eso esto NO es `review`:**

- **#2 `--fix --dry-run`** — no existe. `doctor` acepta `--accept-baseline --actor --fix --max-issues --new --only` y ningún `--dry-run`, aunque otros seis comandos del CLI ya lo tienen. Es el que convierte «me fío del `--only`» en «veo la lista antes de escribir».
- **#3 referencias al nombre viejo reportadas antes de renombrar** — sin empezar. Es el que evita el daño real: renombrar un fichero al que apuntan enlaces deja los enlaces rotos y el `doctor` no los relaciona con el renombrado que los rompió.

**Salida: `next`, no `review`.** Dos criterios cumplidos de cuatro, y los dos que faltan son trabajo dentro de la ficha, no evidencia de runtime.
- 2026-09-03 15:31Z illodev@local#062a7c97 — **Los cuatro criterios cerrados. Terminada, no cardeada** — se arreglaba en los mismos dos ficheros y lo probaba la misma tirada.

**#2 `--fix --dry-run`.** Y hay una decisión de alcance dentro: **previsualiza el renombrado y NO corre los otros dos arreglos.** Es una promesa deliberadamente estrecha en vez de una ancha que no podría cumplir — el arreglo de ids delega sus escrituras en `renumberRecord`, que reescribe cuerpos y mueve ficheros, y un `--dry-run` que se lo saltara en silencio informaría «nada que hacer» de un arreglo que no miró. La salida **nombra los dos que no previsualizó**, porque una vista previa callada sobre su propio punto ciego es como alguien concluye que `--fix` es seguro y no lo es.

Y hubo que meterlo en `DRY_RUN_COMMANDS`: el guard `assertDryRunSupported` **rechazó el flag** con `CLI_FLAG_UNSUPPORTED: does not implement --dry-run, and would have made the change anyway`. Ese guard es exactamente lo correcto y merece quedar dicho: se negó en vez de escribir.

**#3 referencias antes de renombrar.** `pathReferrersOf` saca los enlaces entrantes con relación `markdown` — los que nombran un **fichero** y por tanto se rompen; un wiki-link o una arista de frontmatter nombra un **id** y sobrevive. Se leen de `relations` y no de `relation`, porque el segundo es el ganador del ranking y una ficha que además te liste en `related:` mostraría `related` y se perdería. Y si `incoming` venía recortado por `maxBacklinks`, la entrada trae `referencesPartial` en vez de un número que parece completo.

Se imprimen en las dos rutas: en la previa («would break») y en el `--fix` de verdad («are now broken»). El motivo de imprimirlas también en el real: `doctor` reportará esos enlaces muertos en alguna tirada posterior, bajo otra regla, **y nunca dirá qué renombrado los produjo**.

## Medido sobre el repositorio que lo reportó

```
63 rename(s) previewed, nothing written.
Duplicate ids and misplaced trail entries were NOT previewed; `--fix` without `--dry-run` repairs those too.
```

**63 renombrados, 34 de ellos con referencias que se romperían, y cero escrituras** — comprobado leyendo `git status` después: 0 ficheros renombrados. Es el incidente del 2026-08-27 mostrado **antes** de ocurrir, y el número coincide con el que se midió entonces.

Ejemplo de la salida:

```
would rename: ADR-0001-enterprise-ai-usage-refactor.md → ADR-0001-refactor-de-….md
              referenced by DOC-0039, DOC-0120, ADR-0005 — those links name the old filename and would break
```

## Un fallo propio, porque explica un número que aparece en el historial

La primera tirada del `--dry-run` imprimió **0 renombrados** y estuve a punto de darlo por roto. No lo estaba: `… | tee fichero | head -8` cierra la tubería a las ocho líneas, node recibe EPIPE y muere antes de la mitad. **Un `head` puede convertir una medición correcta en un cero**, y es la misma familia que «un pipe devuelve el código de `tail`».

Tests: `--dry-run` pinchado por las tres cosas que importan —el `from → to`, el `notPreviewed`, y **que el fichero siga donde estaba**, leído del disco y no creído del informe—, más un tercer registro en el fixture que enlaza a T-0001 **por nombre de fichero**, porque sin él la lista de referencias se habría aseverado vacía y no probaría nada. Suite: **500 pass, 0 fail**; ratchet `strict` aguantado.

**Salida: `review`.** 4 de 4 criterios, nada pendiente dentro. Falta verlo correr publicado.

## Activity

- 2026-09-03 15:11Z illodev@local#062a7c97 · backlog → next
- 2026-09-03 15:31Z illodev@local#062a7c97 · next → review
