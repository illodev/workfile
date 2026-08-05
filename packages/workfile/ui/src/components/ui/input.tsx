import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { CONTROL_HEIGHT } from "@/components/ui/control-size"

// A local amendment to the generated component: the registry ships one
// height and every dense view in this application patched it, so the field
// now takes the same rungs as the button beside it. Re-apply after
// `shadcn add input`.
//
// `text-base` below `md` stays on every rung a view actually uses. It is not
// a type choice — a field under 16px makes iOS zoom the page on focus, and
// the filter field is the one control a reader taps first on a phone.
const inputVariants = cva(
  [
    "w-full min-w-0 rounded-md border border-input bg-transparent py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  ],
  {
    variants: {
      size: {
        // 24px cannot hold a 16px line, so this rung gives up the zoom
        // guard. Nothing renders it today; a view that wants one should
        // want it on a pointer surface.
        xs: `${CONTROL_HEIGHT.xs} px-2 text-xs md:text-xs`,
        sm: `${CONTROL_HEIGHT.sm} px-2.5`,
        default: `${CONTROL_HEIGHT.default} px-3`,
        lg: `${CONTROL_HEIGHT.lg} px-3`,
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
