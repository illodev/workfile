---
id: T-0241
title: The protocol does not say the four things a drain measured agents getting wrong
status: review
type: task
priority: high
area: core
tags: [protocol, agents]
raised: reported
created: 2026-09-04
updated: 2026-09-04
scope: [packages/workfile/src/modules/agents/agents.ts, packages/workfile/test/agents.test.ts, .project/agents]
---

T-0237 put the two exits into the shipped protocol, and a nine-hour drain of a consuming board on 2026-09-03 then ran eight agents against it. What they got wrong was not what the protocol says. It was four things it does not say, and one it says too absolutely.

Every line here is loaded into every consuming session, so each has to earn its place. These do, and the measurement is why.

## 1. The scope reads as a fence, so agents card instead of widening it

`Before working` says to claim a card before touching its scope. Agents read that as a boundary they may not cross, so when the fix needs a neighbouring file they open a card instead of widening their own claim — which is the exact behaviour `Finish it before you card it` exists to prevent, arriving through the door next to it.

The claim **is** the record. Widening it is how you say what you are touching, not a permission you need. Measured on the drain: of 31 cards opened, 9 cite a scope boundary as the reason.

## 2. A missing decision becomes a card, which is the worst place for it

Of those same 31, **11 were opened because a decision was missing** — and the owner was at the keyboard the whole time. Their words, when shown the pattern: «Crear derivadas porque falta decisión mía? Peor todavía» and «Para algo estoy aquí para que se me pregunte».

A card opened to hold a question moves it out of the only turn that had the context to ask it well, and delivers it to someone who has to rebuild that context before they can even phrase it. Asking costs a sentence. Carding costs two turns and loses the reasoning in between.

## 3. A derived card does not say where it came from

Measured on the same board: **318 cards carrying `raised: derived` and not one with a `source`**. The chain that would make the pattern visible lived in a sentence of prose, when it lived at all — so nobody could see that seven cards were one job until they read all seven.

## 4. Criteria cover one side of a contract and the card closes anyway

A card closed **6 of 6** while the client it fed did not compile. All six criteria described the server. Nothing was wrong with any of them; what was missing was a criterion for the other side of the contract the change crossed.

## 5. And one the protocol says too absolutely

`done` requires evidence from where the change runs, and a commit is not enough — which is right, and is what the two exits are for. But a card whose product is a **measured conclusion** has no runtime to point at. Read strictly, it can never close except by `--force`, which leaves no trace. The measurement is its evidence, and the protocol should say so rather than leaving each board to invent the exception.

## Acceptance criteria

- [x] The protocol says the scope is not a fence: widen your own claim, having checked nobody else holds those paths, and add the criteria for what you widened
- [x] It says a missing decision is a question to ask, not a card to open, and where the card goes when nobody is there to answer
- [x] It says a derived card carries a `source` pointing at what it came out of
- [x] The acceptance-criteria section says a change that crosses a contract needs a criterion on each side
- [x] `done` admits the card whose product is a measured conclusion, without weakening the rule for code
- [x] The test that pins the protocol's rules to the generated surfaces covers every line added here, so none of them can be dropped silently

## Activity

- 2026-09-04 08:24Z illodev@local#2a219b74 · claimed
- 2026-09-04 08:26Z illodev@local#2a219b74 · doing → review

## Notes

- 2026-09-04 08:26Z illodev@local#2a219b74 — 2026-09-04 — **Las cinco reglas escritas, y el protocolo pasa de 89 a 92 líneas.**

Ese número es el coste real: el protocolo se carga entero en cada sesión de cada consumidor, así que cinco reglas por tres líneas sólo se justifica si cada una evita un fallo medido. Las cinco lo son, y la medición va **dentro de la regla**, no en la ficha — que es lo que hace que alguien que la lea dentro de seis meses sepa por qué está ahí.

## Dónde cayó cada una

| regla | dónde | qué evita |
| --- | --- | --- |
| `raised: derived` + `source` | en la viñeta de crear fichas, no aparte | que siete fichas que son un trabajo parezcan siete trabajos |
| **The scope is not a fence** | viñeta propia, justo detrás de `Finish it before you card it` | 9 de 31 fichas abiertas por un límite de scope, que es el comportamiento que la viñeta anterior existe para evitar |
| **A missing decision is a question** | viñeta propia | 11 de 31 abiertas por una decisión que faltaba, con el dueño delante |
| criterio a cada lado del contrato | en `## Acceptance criteria` | un 6 de 6 con el cliente sin compilar |
| `done` sin runtime | en la definición del estado | una ficha cuyo producto es una medición no se puede cerrar más que con `--force`, que no deja rastro |

Y una excepción que va pegada a la del scope, porque sin ella la regla se traga trabajo que se entrega aparte: **una release distinta sí es motivo para partir**, porque una ficha tiene que seguir siendo cerrable contra lo que se publicó. Sale de un caso de esta misma sesión: T-0240 se separó de T-0239 por eso y por nada más.

## Cómo quedan pinchadas

Seis aserciones nuevas en `agents.test.ts`, cada una contra **la frase que lleva la regla**, no contra su sección. Una reescritura que se cargara la regla dejando el encabezado pasaría el test si se afirmara la sección; afirmando la frase, no.

Suite: **517 tests, 0 fallos**. Superficies regeneradas (`agents sync`) y plugin reconstruido, porque lleva su propia copia del protocolo.

Queda en `review`: está en el árbol y probado, sin publicar.
