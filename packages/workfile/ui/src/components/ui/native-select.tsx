import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { CONTROL_HEIGHT } from "@/components/ui/control-size"

// A local amendment to the generated component: the registry knew two rungs
// and the Explorer's bulk strip wanted a third, so it wrote one over the top
// and then had to write the same height onto the buttons beside it to stop
// the strip stepping. All four rungs now come off the shared scale.
// Re-apply after `shadcn add native-select`.
const nativeSelectVariants = cva(
  [
    "w-full min-w-0 appearance-none rounded-md border border-input bg-transparent text-sm shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed dark:bg-input/30 dark:hover:bg-input/50",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  ],
  {
    // The right padding is the chevron's room, so it shrinks with the rung
    // alongside the inset below.
    variants: {
      size: {
        xs: `${CONTROL_HEIGHT.xs} py-0 pl-2 pr-7 text-xs`,
        sm: `${CONTROL_HEIGHT.sm} py-0 pl-2.5 pr-8 text-xs`,
        default: `${CONTROL_HEIGHT.default} py-1 pl-3 pr-9`,
        lg: `${CONTROL_HEIGHT.lg} py-2 pl-3 pr-9`,
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const chevronInset = {
  xs: "right-2 size-3.5",
  sm: "right-2.5 size-3.5",
  default: "right-3.5",
  lg: "right-3.5",
} as const

function NativeSelect({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> &
  VariantProps<typeof nativeSelectVariants>) {
  return (
    <div
      className="group/native-select relative w-fit has-[select:disabled]:opacity-50"
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(nativeSelectVariants({ size }), className)}
        {...props}
      />
      <ChevronDownIcon
        className={cn(
          "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none",
          chevronInset[size ?? "default"]
        )}
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
