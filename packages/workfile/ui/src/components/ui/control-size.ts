/**
 * The height scale every control shares.
 *
 * A toolbar mixes buttons, fields and selects, and each primitive used to
 * carry a ladder of its own: a button at `sm` was 32px, an `Input` was 36px
 * whatever you asked it for, and a `NativeSelect` knew only two rungs. So
 * the views wrote twenty-one heights by hand over the top of whichever they
 * had reached for — fifteen `h-7` and six `h-8`. The Explorer's bulk strip
 * states the cost in its own comment: "a strip of controls that steps up in
 * the middle reads as two strips". It had to state it because the primitives
 * gave it no way to ask. Heights that agree only where somebody remembered
 * to patch them do not agree.
 *
 * So: one ladder, 4px to a rung, and `default` is the second from the
 * bottom. This is a record tool. Nothing in it ever wanted the 36px the
 * registry shipped as its default — every field in the application was
 * already patched down to 32 by hand before this file existed.
 *
 * Tailwind reads class names as literals, so a rung cannot be computed from
 * a number. The classes are written out here once and composed into each
 * primitive's variants; the scanner sees `h-7` here and `px-2.5` there and
 * emits both. That composition is the whole point: it is what makes "the
 * same declared size is the same height" true by construction rather than
 * by review.
 */
export const CONTROL_HEIGHT = {
    xs: "h-6",
    sm: "h-7",
    default: "h-8",
    lg: "h-9"
} as const;

/**
 * The square footprint of the icon-only rung of the same name. An icon
 * button sits in the same row as a labelled one, so the two must land on the
 * same rung or the row steps.
 */
export const CONTROL_SQUARE = {
    xs: "size-6",
    sm: "size-7",
    default: "size-8",
    lg: "size-9"
} as const;

export type ControlSize = keyof typeof CONTROL_HEIGHT;
