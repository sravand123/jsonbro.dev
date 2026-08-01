import * as React from "react"

import { cn } from "@/lib/utils"
import { shortcutTokens } from "@/lib/shortcuts"

/** Renders a binding such as `mod+shift+f` as individual key chips. */
export function Kbd({ binding, className }: { binding: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden="true">
      {shortcutTokens(binding).map((token, index) => (
        <kbd key={`${token}-${index}`} className="kbd">
          {token}
        </kbd>
      ))}
    </span>
  )
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "primary"
}) {
  const tones: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/15 text-destructive",
    info: "bg-info/15 text-info",
    primary: "bg-primary/15 text-primary",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium leading-none",
        tones[tone],
        className
      )}
      {...props}
    />
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Spoken label, when the visible one lacks context (e.g. "4" -> "4 spaces"). */
  ariaLabel?: string
  icon?: React.ComponentType<{ className?: string }>
  disabled?: boolean
  title?: string
}

/**
 * Segmented control with proper radio semantics and arrow-key navigation, which
 * replaces the ad hoc mix of buttons, switches and raw checkboxes in the old UI.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "default",
  className,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  size?: "default" | "sm"
  className?: string
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])

  const move = (from: number, direction: 1 | -1) => {
    const enabled = options
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => !option.disabled)
    if (enabled.length === 0) return
    const position = enabled.findIndex(({ index }) => index === from)
    const next = enabled[(position + direction + enabled.length) % enabled.length]
    onChange(next.option.value)
    refs.current[next.index]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border/70 bg-muted/60 p-[0.125rem]",
        className
      )}
    >
      {options.map((option, index) => {
        const Icon = option.icon
        const active = option.value === value
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel ?? option.label}
            title={option.title ?? option.ariaLabel ?? option.label}
            disabled={option.disabled}
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault()
                move(index, 1)
              }
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault()
                move(index, -1)
              }
            }}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors duration-fast",
              // Dense by default; comfortable enough for a pointer, and the touch
              // surfaces (mobile toolbar) use their own larger sizes.
              size === "sm" ? "h-[1.375rem] px-1.5 text-3xs" : "h-6 px-2 text-2xs",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:text-foreground",
              option.disabled && "cursor-not-allowed opacity-40"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Separator({
  orientation = "horizontal",
  className,
}: {
  orientation?: "horizontal" | "vertical"
  className?: string
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
    />
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-start justify-between gap-6 py-2.5", className)}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
