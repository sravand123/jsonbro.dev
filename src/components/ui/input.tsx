import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "transition-[border-color,box-shadow] duration-fast",
          "placeholder:text-muted-foreground",
          // Focus is carried by a soft halo plus a slightly brighter border, not by
          // a saturated green outline: a hard green line on a dark surface reads as
          // an error state rather than "this field is focused".
          "focus-visible:outline-none focus-visible:border-ring/45 focus-visible:ring-[0.1875rem] focus-visible:ring-primary/15",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
