import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CommandPalette } from '@/components/shell/CommandPalette'
import { ShortcutsDialog } from '@/components/shell/ShortcutsDialog'
import { SearchPanel } from '@/components/inspector/SearchPanel'
import { TreeView } from '@/components/tree/TreeView'
import type { Command } from '@/lib/commands'
import type { SearchOptions, SearchResultPayload } from '@/workers/protocol'

const commands: Command[] = [
  { id: 'transform.format', title: 'Format document', group: 'Transform', binding: 'mod+shift+f', run: vi.fn() },
  { id: 'document.copy', title: 'Copy document', group: 'Document', binding: 'mod+alt+c', run: vi.fn() },
  {
    id: 'document.clear',
    title: 'Clear',
    group: 'Document',
    destructive: true,
    enabled: false,
    run: vi.fn(),
  },
]

describe('CommandPalette', () => {
  it('lists commands grouped, with their shortcuts', () => {
    render(<CommandPalette open onOpenChange={() => {}} commands={commands} />)
    expect(screen.getByText('Format document')).toBeInTheDocument()
    expect(screen.getByText('Copy document')).toBeInTheDocument()
    expect(screen.getByText('Transform')).toBeInTheDocument()
    expect(screen.getByText('Document')).toBeInTheDocument()
  })

  it('filters as the user types and runs the chosen command', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<CommandPalette open onOpenChange={onOpenChange} commands={commands} />)

    await user.type(screen.getByRole('combobox'), 'copy')
    await waitFor(() => expect(screen.queryByText('Format document')).not.toBeInTheDocument())

    await user.click(screen.getByText('Copy document'))
    expect(commands[1].run).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not run disabled commands', async () => {
    const user = userEvent.setup()
    render(<CommandPalette open onOpenChange={() => {}} commands={commands} />)
    await user.click(screen.getByText('Clear'))
    expect(commands[2].run).not.toHaveBeenCalled()
  })
})

describe('ShortcutsDialog', () => {
  it('is generated from the command registry', () => {
    render(<ShortcutsDialog open onOpenChange={() => {}} commands={commands} />)
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    expect(screen.getByText('Format document')).toBeInTheDocument()
    // Commands without a binding are omitted.
    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
  })
})

const searchOptions: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
  scope: 'both',
}

const results: SearchResultPayload = {
  matches: [
    { path: '$.name', key: 'name', kind: 'string', preview: '"Alpha"', offset: 10, length: 6, matchedIn: 'key' },
    { path: '$.list[0]', kind: 'string', preview: '"alpha"', offset: 40, length: 7, matchedIn: 'value' },
  ],
  total: 2,
  truncated: false,
}

describe('SearchPanel', () => {
  it('shows the match position and result list', () => {
    render(
      <SearchPanel
        term="alpha"
        onTermChange={() => {}}
        options={searchOptions}
        onOptionsChange={() => {}}
        results={results}
        activeIndex={0}
        onActivate={() => {}}
        onNext={() => {}}
        onPrevious={() => {}}
        searching={false}
      />,
    )

    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByText('$.name')).toBeInTheDocument()
    expect(screen.getByText('$.list[0]')).toBeInTheDocument()
  })

  it('exposes the option toggles with pressed state', async () => {
    const user = userEvent.setup()
    const onOptionsChange = vi.fn()
    render(
      <SearchPanel
        term="a"
        onTermChange={() => {}}
        options={searchOptions}
        onOptionsChange={onOptionsChange}
        results={results}
        activeIndex={0}
        onActivate={() => {}}
        onNext={() => {}}
        onPrevious={() => {}}
        searching={false}
      />,
    )

    const caseToggle = screen.getByRole('button', { name: 'Match case' })
    expect(caseToggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(caseToggle)
    expect(onOptionsChange).toHaveBeenCalledWith({ caseSensitive: true })

    await user.click(screen.getByRole('button', { name: 'Use regular expression' }))
    expect(onOptionsChange).toHaveBeenCalledWith({ useRegex: true })
  })

  it('activates a result when clicked and steps with Enter', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    const onNext = vi.fn()
    render(
      <SearchPanel
        term="alpha"
        onTermChange={() => {}}
        options={searchOptions}
        onOptionsChange={() => {}}
        results={results}
        activeIndex={0}
        onActivate={onActivate}
        onNext={onNext}
        onPrevious={() => {}}
        searching={false}
      />,
    )

    await user.click(screen.getByText('$.list[0]'))
    expect(onActivate).toHaveBeenCalledWith(1)

    await user.type(screen.getByLabelText('Search the document'), '{Enter}')
    expect(onNext).toHaveBeenCalled()
  })
})

const treeData = {
  user: { name: 'bro', age: 30 },
  tags: ['a', 'b'],
}
const treeText = JSON.stringify(treeData, null, 2)

function renderTree(overrides: Partial<React.ComponentProps<typeof TreeView>> = {}) {
  const onTextChange = vi.fn()
  const onRevealPath = vi.fn()
  const onCopyPath = vi.fn()
  const utils = render(
    <TreeView
      data={treeData}
      text={treeText}
      onTextChange={onTextChange}
      indent={2}
      editable
      onRevealPath={onRevealPath}
      onCopyPath={onCopyPath}
      onCopyValue={vi.fn()}
      {...overrides}
    />,
  )
  return { ...utils, onTextChange, onRevealPath, onCopyPath }
}

describe('TreeView', () => {
  it('renders the root expanded with its children', () => {
    renderTree()
    expect(screen.getByRole('tree', { name: 'JSON structure' })).toBeInTheDocument()
    expect(screen.getByText('user')).toBeInTheDocument()
    expect(screen.getByText('tags')).toBeInTheDocument()
    // Nested values stay collapsed until asked for.
    expect(screen.queryByText('name')).not.toBeInTheDocument()
  })

  it('expands and collapses a branch', async () => {
    const user = userEvent.setup()
    renderTree()

    const expandButtons = screen.getAllByRole('button', { name: 'Expand' })
    await user.click(expandButtons[0])
    expect(screen.getByText('name')).toBeInTheDocument()

    // The root is expanded too, so target the branch we just opened.
    const collapseButtons = screen.getAllByRole('button', { name: 'Collapse' })
    await user.click(collapseButtons[collapseButtons.length - 1])
    expect(screen.queryByText('name')).not.toBeInTheDocument()
  })

  it('expands everything at once', async () => {
    const user = userEvent.setup()
    renderTree()
    await user.click(screen.getByRole('button', { name: /expand all/i }))
    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('age')).toBeInTheDocument()
  })

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup()
    renderTree()
    const tree = screen.getByRole('tree')
    tree.focus()

    await user.keyboard('{ArrowDown}')
    const rows = screen.getAllByRole('treeitem')
    expect(rows[1]).toHaveAttribute('aria-selected', 'true')

    // ArrowRight expands the focused branch.
    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('name')).toBeInTheDocument()
  })

  it('copies the path of the focused row with "c"', async () => {
    const user = userEvent.setup()
    const { onCopyPath } = renderTree()
    screen.getByRole('tree').focus()
    await user.keyboard('{ArrowDown}c')
    expect(onCopyPath).toHaveBeenCalledWith('$.user')
  })

  it('edits a primitive value and writes it back to the text', async () => {
    const user = userEvent.setup()
    const { onTextChange } = renderTree()

    await user.click(screen.getAllByRole('button', { name: 'Expand' })[0])
    await user.click(screen.getByRole('button', { name: 'Edit value at $.user.age' }))

    const input = screen.getByLabelText('New value for $.user.age')
    await user.clear(input)
    await user.type(input, '31{Enter}')

    expect(onTextChange).toHaveBeenCalled()
    const written = onTextChange.mock.calls.at(-1)![0] as string
    expect(JSON.parse(written).user.age).toBe(31)
  })

  it('deletes a node', async () => {
    const user = userEvent.setup()
    const { onTextChange } = renderTree()
    await user.click(screen.getByRole('button', { name: 'Delete $.tags' }))
    const written = onTextChange.mock.calls.at(-1)![0] as string
    expect(JSON.parse(written)).not.toHaveProperty('tags')
  })

  it('reveals a value in the editor from the row action', async () => {
    const user = userEvent.setup()
    const { onRevealPath } = renderTree()
    await user.click(screen.getAllByRole('button', { name: 'Expand' })[0])
    await user.click(
      screen.getByRole('button', { name: 'Reveal $.user.name in the editor' }),
    )
    expect(onRevealPath).toHaveBeenCalledWith(['user', 'name'])
  })

  it('selecting a row does not navigate away from the tree', async () => {
    const user = userEvent.setup()
    const { onRevealPath } = renderTree()
    await user.click(screen.getAllByRole('button', { name: 'Expand' })[0])
    await user.click(screen.getByText('"bro"'))
    expect(onRevealPath).not.toHaveBeenCalled()
  })

  it('hides editing affordances when not editable', () => {
    renderTree({ editable: false })
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument()
  })
})
