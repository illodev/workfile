import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { CONTROL_HEIGHT, CONTROL_SQUARE } from "@/components/ui/control-size"

// A local amendment to the generated component: the rungs come off the
// shared scale so a button, a field and a select of the same declared size
// are the same height. Re-apply after `shadcn add button` — the rest of the
// file is stock.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Padding and type ride the rung: at 28px a 14px label sits on the
      // border, which is why ten of the twelve buttons that hand-wrote `h-7`
      // wrote `text-xs` beside it.
      size: {
        xs: `${CONTROL_HEIGHT.xs} gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3`,
        sm: `${CONTROL_HEIGHT.sm} gap-1.5 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5`,
        default: `${CONTROL_HEIGHT.default} px-3 has-[>svg]:px-2.5`,
        lg: `${CONTROL_HEIGHT.lg} px-4 has-[>svg]:px-3.5`,
        "icon-xs": `${CONTROL_SQUARE.xs} [&_svg:not([class*='size-'])]:size-3`,
        "icon-sm": `${CONTROL_SQUARE.sm} [&_svg:not([class*='size-'])]:size-3.5`,
        icon: CONTROL_SQUARE.default,
        "icon-lg": CONTROL_SQUARE.lg,
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
