/**
 * The fields of a card this module reads, and no more.
 *
 * Structural rather than `Task` on purpose: it keeps the module free of every
 * other import, which is what lets the Node test suite load it directly and
 * pin the trail format against the writer that produces it.
 */
export interface Placeable {
    start?: string;
    due?: string;
    body?: string;
}

/**
 * What the chart draws a card from.
 *
 * `plan` is the Gantt this view has always been: `start` and `due`, the dates
 * somebody committed to. `actual` is the stretch the card recorded about
 * itself — the first and last entries of its `## Activity` trail, which is
 * when the work was claimed and when it closed.
 *
 * Two different claims about a card, and neither substitutes for the other.
 * That is why this is a mode rather than a fallback: a bar drawn from a
 * creation date, sitting in the slot where a reader expects a planned start,
 * is a lie no tooltip undoes. A workspace that schedules nothing is not a
 * workspace where nothing happened, and this is the distinction that lets the
 * view say so.
 */
export type TimelineMode = "plan" | "actual";

export interface Span {
    from: number;
    to: number;
    /** A card that marks a moment rather than a stretch. */
    point: boolean;
}

export interface Tick {
    key: number;
    label: string;
    left: number;
}

export interface Axis {
    start: number;
    end: number;
    ticks: Tick[];
    pct: (time: number) => number;
    /** Position of the now marker, or null when now is off the chart. */
    today: number | null;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

const parseDay = (value: string) => Date.parse(`${value}T00:00:00Z`);

/** The minute stamp `activityEntry` writes, and the one tooltips echo back. */
export function stamp(time: number): string {
    return `${new Date(time).toISOString().slice(0, 16).replace("T", " ")}Z`;
}

/**
 * The interval a card was scheduled for, or null when nobody scheduled it.
 *
 * `due` is inclusive — a card due on the 4th is worked through the 4th — so
 * the bar ends at the following midnight rather than at the start of its own
 * last day, where it would render as a day short.
 */
export function planSpan(task: Placeable): Span | null {
    const start = task.start ? parseDay(task.start) : Number.NaN;
    const due = task.due ? parseDay(task.due) : Number.NaN;
    const hasStart = Number.isFinite(start);
    const hasDue = Number.isFinite(due);
    if (hasStart && hasDue) return { from: start, to: due + DAY, point: false };
    if (hasStart) return { from: start, to: start + DAY, point: true };
    if (hasDue) return { from: due, to: due + DAY, point: true };
    return null;
}

const HEADING = "## Activity";

/**
 * `## Notes` lines carry the same leading stamp as trail entries, so a body
 * scanned whole would mix a note written days later into the work's interval.
 */
function activitySection(body: string): string {
    const at = body.indexOf(HEADING);
    if (at === -1) return "";
    const rest = body.slice(at + HEADING.length);
    const next = rest.indexOf("\n## ");
    return next === -1 ? rest : rest.slice(0, next);
}

/** `- 2026-08-02 19:26Z actor · text`, as `activityEntry` composes it. */
const TRAIL_STAMP = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})Z /gm;

/**
 * The stretch between a card's first and last recorded milestone.
 *
 * Minute resolution because that is what the trail stores, and because it is
 * the resolution the work happens at: on this repository the median card is
 * claimed and closed inside ten minutes.
 */
export function activitySpan(body?: string): Span | null {
    const stamps: number[] = [];
    for (const match of activitySection(body ?? "").matchAll(TRAIL_STAMP)) {
        const time = Date.parse(`${match[1]}T${match[2]}:00Z`);
        if (Number.isFinite(time)) stamps.push(time);
    }
    if (!stamps.length) return null;
    const from = Math.min(...stamps);
    const to = Math.max(...stamps);
    return { from, to, point: from === to };
}

export function spanOf(task: Placeable, mode: TimelineMode): Span | null {
    return mode === "actual" ? activitySpan(task.body) : planSpan(task);
}

export function drawableCount(tasks: Placeable[], mode: TimelineMode): number {
    let count = 0;
    for (const task of tasks) if (spanOf(task, mode)) count += 1;
    return count;
}

/**
 * The mode to open on, preferring what somebody planned.
 *
 * A project that sets dates means them, and its Gantt is the reading it asked
 * for; the trail is what a project that sets none has instead.
 */
export function preferredMode(tasks: Placeable[]): TimelineMode {
    if (tasks.some((task) => planSpan(task))) return "plan";
    if (tasks.some((task) => activitySpan(task.body))) return "actual";
    return "plan";
}

/** What a row's bar says on hover, in the vocabulary of the mode drawing it. */
export function spanTitle(task: Placeable, mode: TimelineMode, span: Span): string {
    return mode === "actual"
        ? `${stamp(span.from)} → ${stamp(span.to)}`
        : `${task.start || "?"} → ${task.due || "?"}`;
}

function dayLabel(time: number, withYear: boolean) {
    return new Date(time).toLocaleDateString("en", {
        month: "short",
        day: "numeric",
        ...(withYear ? { year: "numeric" } : {}),
        timeZone: "UTC"
    });
}

/**
 * The scale under the chart, at whatever granularity the data has.
 *
 * A fixed month scale was fine while the only source was `start`/`due`, which
 * people set in weeks. The trail spans hours, and rendering four days of it
 * against a single "Aug" gridline says nothing about when anything happened.
 *
 * Three tiers, no more: hours and days exist because there is data at both,
 * and a week tier for the gap between them would be a guess about spans this
 * repository cannot produce.
 */
export function axisFor(spans: Span[], now: number): Axis | null {
    if (!spans.length) return null;
    const min = Math.min(...spans.map((span) => span.from));
    const max = Math.max(...spans.map((span) => Math.max(span.from, span.to)));
    const width = max - min;

    if (width > 16 * DAY) {
        // Padded to whole months, so the scale starts on a gridline.
        const first = new Date(min);
        const last = new Date(max);
        const start = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
        const end = Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1);
        const pct = (time: number) => ((time - start) / (end - start)) * 100;
        const ticks: Tick[] = [];
        for (
            let cursor = start;
            cursor < end;
            cursor = Date.UTC(
                new Date(cursor).getUTCFullYear(),
                new Date(cursor).getUTCMonth() + 1,
                1
            )
        ) {
            const date = new Date(cursor);
            ticks.push({
                key: cursor,
                label: date.toLocaleDateString("en", {
                    month: "short",
                    ...(cursor === start || date.getUTCMonth() === 0
                        ? { year: "numeric" }
                        : {}),
                    timeZone: "UTC"
                }),
                left: pct(cursor)
            });
        }
        return {
            start,
            end,
            ticks,
            pct,
            today: now >= start && now <= end ? pct(now) : null
        };
    }

    const step = width <= 2 * DAY ? 6 * HOUR : DAY;
    const start = Math.floor(min / step) * step;
    // A single card, or several recorded in the same minute, has no width at
    // all; without this the scale divides by zero and every bar renders NaN.
    const end = Math.max(Math.ceil(max / step) * step, start + step);
    const pct = (time: number) => ((time - start) / (end - start)) * 100;
    const ticks: Tick[] = [];
    for (let cursor = start; cursor < end; cursor += step) {
        const midnight = cursor % DAY === 0;
        ticks.push({
            key: cursor,
            // On the hour scale the date belongs to midnight and the hour to
            // everything else, so the day is named once instead of six times.
            label:
                step === DAY || midnight
                    ? dayLabel(cursor, cursor === start)
                    : new Date(cursor).toLocaleTimeString("en", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                          timeZone: "UTC"
                      }),
            left: pct(cursor)
        });
    }
    return {
        start,
        end,
        ticks,
        pct,
        today: now >= start && now <= end ? pct(now) : null
    };
}
