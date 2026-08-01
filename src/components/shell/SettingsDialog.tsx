import { RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, Segmented, Separator } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { defaultSettings, type EditorSettings } from '@/hooks/useEditorSettings'
import type { ThemePreference } from '@/hooks/useTheme'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: EditorSettings
  onChange: (patch: Partial<EditorSettings>) => void
  onReset: () => void
  themePreference: ThemePreference
  onThemeChange: (preference: ThemePreference) => void
  usingWorker: boolean
}

const tabSizes = [
  { value: '2', label: '2', ariaLabel: '2 spaces' },
  { value: '4', label: '4', ariaLabel: '4 spaces' },
  { value: '8', label: '8', ariaLabel: '8 spaces' },
]

const fontSizes = [
  { value: 'auto', label: 'Auto', ariaLabel: 'Automatic font size' },
  { value: '12', label: '12', ariaLabel: '12 pixels' },
  { value: '13', label: '13', ariaLabel: '13 pixels' },
  { value: '14', label: '14', ariaLabel: '14 pixels' },
  { value: '16', label: '16', ariaLabel: '16 pixels' },
]

const lineHeights = [
  { value: '1.35', label: 'Tight', ariaLabel: 'Tight line height' },
  { value: '1.5', label: 'Normal', ariaLabel: 'Normal line height' },
  { value: '1.75', label: 'Relaxed', ariaLabel: 'Relaxed line height' },
]

/**
 * Settings apply immediately — there is no Save button to forget, and no local
 * copy of state that can drift out of sync with the editors.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onChange,
  onReset,
  themePreference,
  onThemeChange,
  usingWorker,
}: Props) {
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (!open) setAnnouncement('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Changes apply instantly and are stored locally on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Appearance
          </h3>

          <Field label="Theme" hint="System follows your operating system setting.">
            <Segmented
              label="Theme"
              value={themePreference}
              onChange={(value) => onThemeChange(value as ThemePreference)}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
            />
          </Field>

          <Field label="Font size" hint="Auto scales gently with the window width.">
            <Segmented
              label="Font size"
              value={settings.fontSize === 'auto' ? 'auto' : String(settings.fontSize)}
              onChange={(value) =>
                onChange({ fontSize: value === 'auto' ? 'auto' : Number(value) })
              }
              options={fontSizes}
              size="sm"
            />
          </Field>

          <Field label="Line height">
            <Segmented
              label="Line height"
              value={String(settings.lineHeight)}
              onChange={(value) => onChange({ lineHeight: Number(value) })}
              options={lineHeights}
              size="sm"
            />
          </Field>

          <Separator className="my-3" />
          <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Editor
          </h3>

          <Field label="Indentation" hint="Used when formatting and when saving files.">
            <Segmented
              label="Indentation"
              value={String(settings.tabSize)}
              onChange={(value) => onChange({ tabSize: Number(value) })}
              options={tabSizes}
              size="sm"
            />
          </Field>

          <Field label="Wrap long lines" htmlFor="setting-wrap">
            <Switch
              id="setting-wrap"
              checked={settings.wordWrap}
              onCheckedChange={(checked) => onChange({ wordWrap: checked })}
            />
          </Field>

          <Field label="Line numbers" htmlFor="setting-line-numbers">
            <Switch
              id="setting-line-numbers"
              checked={settings.lineNumbers}
              onCheckedChange={(checked) => onChange({ lineNumbers: checked })}
            />
          </Field>

          <Field label="Minimap" htmlFor="setting-minimap">
            <Switch
              id="setting-minimap"
              checked={settings.minimap}
              onCheckedChange={(checked) => onChange({ minimap: checked })}
            />
          </Field>

          <Field
            label="Sticky scroll"
            hint="Keeps parent keys pinned to the top while you scroll."
            htmlFor="setting-sticky"
          >
            <Switch
              id="setting-sticky"
              checked={settings.stickyScroll}
              onCheckedChange={(checked) => onChange({ stickyScroll: checked })}
            />
          </Field>

          <Field label="Bracket pair guides" htmlFor="setting-brackets">
            <Switch
              id="setting-brackets"
              checked={settings.bracketPairGuides}
              onCheckedChange={(checked) => onChange({ bracketPairGuides: checked })}
            />
          </Field>

          <Field label="Font ligatures" htmlFor="setting-ligatures">
            <Switch
              id="setting-ligatures"
              checked={settings.fontLigatures}
              onCheckedChange={(checked) => onChange({ fontLigatures: checked })}
            />
          </Field>

          <Field label="Show whitespace" htmlFor="setting-whitespace">
            <Switch
              id="setting-whitespace"
              checked={settings.renderWhitespace}
              onCheckedChange={(checked) => onChange({ renderWhitespace: checked })}
            />
          </Field>

          <Field
            label="Format valid JSON on paste"
            hint="Skipped automatically for very large documents."
            htmlFor="setting-format-paste"
          >
            <Switch
              id="setting-format-paste"
              checked={settings.formatOnPaste}
              onCheckedChange={(checked) => onChange({ formatOnPaste: checked })}
            />
          </Field>

          <Separator className="my-3" />
          <p className="text-2xs leading-relaxed text-muted-foreground">
            Parsing, validation and search run{' '}
            {usingWorker ? 'in a background thread' : 'on the main thread (workers unavailable)'}.
            Nothing you paste leaves this device.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => {
              onReset()
              setAnnouncement('Settings restored to defaults')
            }}
            disabled={JSON.stringify(settings) === JSON.stringify(defaultSettings)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Restore defaults
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>

        <span aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </DialogContent>
    </Dialog>
  )
}
