import { Toaster } from 'sonner'

import { JsonBroApp } from '@/components/JsonBroApp'
import { useTheme } from '@/hooks/useTheme'

export default function App() {
  const { resolved } = useTheme()

  return (
    <>
      <JsonBroApp />
      {/*
        Toasts.

        Sonner's `richColors` fills the whole toast with a saturated green or red, which
        looks nothing like the rest of this interface. These use the same surface, border,
        radius and blur as the dialogs and the error report, and let a single coloured
        icon carry the status — quieter, and it belongs.

        Everything is expressed in rem because sonner ships its own stylesheet in pixels
        and injects it at runtime, so plain CSS overrides lose the cascade; its `style` and
        `classNames` API is the only reliable way in.

        The stack sits just above the status bar. It used to be lifted 76px to clear the
        error report, which has since become a small pill in the opposite corner.
      */}
      <Toaster
        theme={resolved}
        position="bottom-right"
        offset="1.75rem"
        // Sonner collapses its stack by default, so a second toast landed on top of the
        // first and hid its text and close button.
        expand
        visibleToasts={4}
        closeButton
        style={
          {
            '--width': '20rem',
            '--gap': '0.5rem',
          } as React.CSSProperties
        }
        toastOptions={{
          duration: 4000,
          classNames: {
            toast: [
              '!items-start !gap-2.5 !rounded-lg !p-3',
              '!border !border-border !bg-popover/95 !text-foreground !backdrop-blur-md',
              '!shadow-overlay !text-sm',
            ].join(' '),
            title: '!text-sm !font-medium !leading-tight',
            description: '!mt-0.5 !text-xs !leading-snug !text-muted-foreground',
            // The glyphs need explicit sizing: sonner gives its SVGs fixed attributes, so
            // the buttons scaled with the interface while the icons inside them did not.
            icon: '!mr-0 !mt-px !h-4 !w-4 [&>svg]:!h-full [&>svg]:!w-full',
            success: '[&_[data-icon]]:!text-primary',
            error: '[&_[data-icon]]:!text-destructive',
            warning: '[&_[data-icon]]:!text-warning',
            info: '[&_[data-icon]]:!text-info',
            actionButton:
              '!h-6 !rounded !bg-primary !px-2 !text-xs !font-medium !text-primary-foreground hover:!bg-primary/90',
            cancelButton: '!h-6 !rounded !bg-muted !px-2 !text-xs !text-muted-foreground',
            closeButton:
              '!h-5 !w-5 !border-border !bg-popover !text-muted-foreground hover:!text-foreground [&>svg]:!h-3 [&>svg]:!w-3',
          },
        }}
      />
    </>
  )
}
