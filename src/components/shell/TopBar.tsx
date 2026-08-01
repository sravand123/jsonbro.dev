import {
  Braces,
  ChevronDown,
  Copy,
  Download,
  FileJson2,
  GitCompare,
  Keyboard,
  ListTree,
  Loader2,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelRight,
  Search,
  Settings,
  Sparkles,
  Sun,
  Terminal,
  Upload,
  Wand2,
} from 'lucide-react'

import { GitHubStars } from '@/components/GitHubStars'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd, Segmented } from '@/components/ui/primitives'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { pickCommand, type Command } from '@/lib/commands'
import type { ThemePreference } from '@/hooks/useTheme'
import type { Workspace } from '@/lib/workspace'
import { cn } from '@/lib/utils'

interface Props {
  commands: Command[]
  workspace: Workspace
  onWorkspaceChange: (workspace: Workspace) => void
  themePreference: ThemePreference
  onThemeChange: (preference: ThemePreference) => void
  inspectorOpen: boolean
  onToggleInspector: () => void
  onOpenPalette: () => void
  paletteBinding: string
  busy: boolean
}

const workspaceOptions = [
  { value: 'editor' as const, label: 'Editor', icon: FileJson2 },
  { value: 'tree' as const, label: 'Tree', icon: ListTree },
  { value: 'compare' as const, label: 'Compare', icon: GitCompare },
  { value: 'query' as const, label: 'Query', icon: Terminal },
]

function IconAction({
  command,
  icon: Icon,
  label,
}: {
  command?: Command
  icon: typeof Copy
  label?: string
}) {
  if (!command) return null
  const title = label ?? command.title
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          // 44px on touch screens (Fitts's Law), compact on pointer devices.
          className="h-11 w-11 text-muted-foreground hover:text-foreground md:h-7 md:w-7"
          onClick={() => void command.run()}
          disabled={command.enabled === false}
          aria-label={title}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2 py-1 text-xs">
        {title}
        {command.binding && <Kbd binding={command.binding} />}
      </TooltipContent>
    </Tooltip>
  )
}

export function TopBar({
  commands,
  workspace,
  onWorkspaceChange,
  themePreference,
  onThemeChange,
  inspectorOpen,
  onToggleInspector,
  onOpenPalette,
  paletteBinding,
  busy,
}: Props) {
  const format = pickCommand(commands, 'transform.format')
  const repair = pickCommand(commands, 'transform.repair')
  /*
    The primary slot offers repair whenever a fix is available, and formatting otherwise.

    Formatting cannot succeed on a document that does not parse — it reports "fix the syntax
    errors first" — so "Format" is dead weight in precisely the state where repair is the
    thing you want. Repair used to live only in the palette, the overflow menu and behind a
    hover on the inline error report, which made the app's most useful recovery action its
    least discoverable one.
  */
  const isRepair = repair?.enabled === true
  const primary = isRepair ? repair : format
  // On small screens the icon row collapses, so those actions must also be here.
  const overflowIds = [
    'document.copy',
    'document.download',
    'document.open',
    'transform.minify',
    'transform.sortKeys',
    'transform.repair',
    'compare.sendLeft',
    'document.share',
    'document.clear',
  ]
  const overflow = overflowIds
    .map((id) => pickCommand(commands, id))
    .filter((command): command is Command => Boolean(command))
  const compactOnlyIds = new Set(['document.copy', 'document.download', 'document.open'])

  const ThemeIcon =
    themePreference === 'system' ? Monitor : themePreference === 'dark' ? Moon : Sun

  return (
    <header className="flex h-topbar shrink-0 items-center gap-2 border-b bg-surface px-2 sm:px-3">
      <a
        href="/"
        className="flex shrink-0 items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent/60"
        aria-label="JsonBro.dev home"
      >
        <Braces className="h-[1.125rem] w-[1.125rem] text-primary" aria-hidden="true" />
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">JsonBro</span>
      </a>

      <div className="hidden md:block">
        <Segmented
          label="Workspace"
          options={workspaceOptions}
          value={workspace}
          onChange={onWorkspaceChange}
        />
      </div>

      {/* Workspace switcher for narrow viewports */}
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs">
              {workspaceOptions.find((option) => option.value === workspace)?.label}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {workspaceOptions.map((option) => (
              <DropdownMenuItem key={option.value} onSelect={() => onWorkspaceChange(option.value)}>
                <option.icon className="h-4 w-4" aria-hidden="true" />
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Search commands"
        className={cn(
          'ml-auto flex h-11 min-w-0 shrink-0 items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2 md:h-7',
          'text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground',
        )}
      >
        <Search className="h-4 w-4 shrink-0 md:h-3.5 md:w-3.5" aria-hidden="true" />
        <span className="hidden lg:inline">Search commands</span>
        <Kbd binding={paletteBinding} className="hidden sm:inline-flex" />
      </button>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {primary && (
          <Button
            /*
              Remounting on the swap restarts the attention animation, so the cue plays each
              time a fix becomes available rather than only on first render.
            */
            key={isRepair ? 'repair' : 'format'}
            size="sm"
            className={cn(
              'h-11 gap-1.5 px-3 text-xs md:h-7 md:px-2.5',
              // Repair is tinted as a warning: it appears because something is wrong, and it
              // rewrites the document rather than just reflowing it. The glow runs twice and
              // stops — see the `attention` keyframe for why it is not a loop.
              isRepair && 'animate-attention bg-warning text-warning-foreground hover:bg-warning/90',
            )}
            onClick={() => void primary.run()}
            disabled={primary.enabled === false}
            aria-label={isRepair ? 'Repair invalid JSON' : 'Format document'}
            title={
              isRepair
                ? 'This document has a problem that can be fixed automatically'
                : undefined
            }
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : isRepair ? (
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{isRepair ? 'Repair' : 'Format'}</span>
          </Button>
        )}

        {/* Secondary actions collapse into the overflow menu on small screens. */}
        <div className="hidden items-center gap-1 sm:flex">
          <IconAction command={pickCommand(commands, 'document.copy')} icon={Copy} />
          <IconAction command={pickCommand(commands, 'document.download')} icon={Download} />
          <IconAction command={pickCommand(commands, 'document.open')} icon={Upload} />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-muted-foreground hover:text-foreground md:h-7 md:w-7"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {overflow.map((command) => {
              const Icon = command.icon
              return (
                <DropdownMenuItem
                  key={command.id}
                  destructive={command.destructive}
                  disabled={command.enabled === false}
                  onSelect={() => void command.run()}
                  className={compactOnlyIds.has(command.id) ? 'sm:hidden' : undefined}
                >
                  {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                  {command.title}
                  {command.binding && (
                    <DropdownMenuShortcut>
                      <Kbd binding={command.binding} />
                    </DropdownMenuShortcut>
                  )}
                </DropdownMenuItem>
              )
            })}

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            {(['light', 'dark', 'system'] as const).map((option) => (
              <DropdownMenuItem
                key={option}
                onSelect={() => onThemeChange(option)}
                className={themePreference === option ? 'text-primary' : undefined}
              >
                {option === 'light' ? (
                  <Sun className="h-4 w-4" aria-hidden="true" />
                ) : option === 'dark' ? (
                  <Moon className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="capitalize">{option}</span>
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            {pickCommand(commands, 'view.settings') && (
              <DropdownMenuItem
                onSelect={() => void pickCommand(commands, 'view.settings')!.run()}
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
                Editor settings
              </DropdownMenuItem>
            )}
            {pickCommand(commands, 'help.shortcuts') && (
              <DropdownMenuItem
                onSelect={() => void pickCommand(commands, 'help.shortcuts')!.run()}
              >
                <Keyboard className="h-4 w-4" aria-hidden="true" />
                Keyboard shortcuts
                <DropdownMenuShortcut>
                  <span className="kbd">?</span>
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-11 w-11 text-muted-foreground hover:text-foreground sm:inline-flex md:h-7 md:w-7"
              aria-label={`Theme: ${themePreference}. Click to change.`}
              onClick={() => onThemeChange(themePreference === 'dark' ? 'light' : 'dark')}
            >
              <ThemeIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="py-1 text-xs">
            Toggle theme
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-11 w-11 text-muted-foreground hover:text-foreground md:h-7 md:w-7',
                inspectorOpen && 'bg-accent text-foreground',
              )}
              aria-label="Toggle inspector panel"
              aria-pressed={inspectorOpen}
              onClick={onToggleInspector}
            >
              <PanelRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="flex items-center gap-2 py-1 text-xs">
            Inspector
            <Kbd binding="mod+b" />
          </TooltipContent>
        </Tooltip>

        <div className="hidden xl:block">
          <GitHubStars />
        </div>
      </div>

    </header>
  )
}
