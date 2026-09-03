---
id: T-0233
title: doctor --fix cannot be scoped, and its own warning recommends it
status: next
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
- [ ] `doctor --fix --dry-run` prints the `from → to` list without writing
- [ ] Before renaming, references to the old filename are reported
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

## Activity

- 2026-09-03 15:11Z illodev@local#062a7c97 · backlog → next
