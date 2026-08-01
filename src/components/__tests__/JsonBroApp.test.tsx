import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clear, get } from 'idb-keyval'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JsonBroApp } from '@/components/JsonBroApp'
import { SAMPLE_JSON } from '@/lib/sample'

/**
 * Feature-parity harness.
 *
 * Monaco cannot render meaningfully in jsdom, so the editor host is replaced by a
 * textarea that keeps the same contract (value / onChange / imperative handle).
 * Everything else — commands, shortcuts, analysis, search, persistence, status —
 * is the real implementation.
 */
vi.mock('@/components/editor/JsonEditor', async () => {
  const { forwardRef, useImperativeHandle, createElement } = await import('react')
  return {
    JsonEditor: forwardRef<
      unknown,
      { value: string; onChange: (next: string) => void; ariaLabel: string }
    >((props, ref) => {
      useImperativeHandle(ref, () => ({
        focus: () => {},
        revealOffset: () => {},
        revealPosition: () => {},
        getEditor: () => null,
        runAction: () => {},
      }))
      return createElement('textarea', {
        'aria-label': props.ariaLabel,
        value: props.value,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
          props.onChange(event.target.value),
      })
    }),
  }
})

vi.mock('@/components/compare/CompareWorkspace', async () => {
  const { createElement } = await import('react')
  return {
    CompareWorkspace: (props: { left: { text: string }; right: { text: string } }) =>
      createElement(
        'div',
        { 'data-testid': 'compare-workspace' },
        `left:${props.left.text.length} right:${props.right.text.length}`,
      ),
  }
})

const typeInEditor = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
  const editor = (await screen.findByLabelText('JSON editor')) as HTMLTextAreaElement
  // Wait for the restore pass to settle so it cannot land after we type.
  await waitFor(() => expect(editor).not.toBeDisabled())
  await user.clear(editor)
  await user.paste(value)
  await waitFor(() => expect(editor.value).toBe(value))
  return editor
}

beforeEach(async () => {
  localStorage.clear()
  window.location.hash = ''
  document.documentElement.classList.remove('dark')
  // The app persists to IndexedDB; without this, documents leak across tests.
  await clear()
})

describe('JsonBroApp shell', () => {
  it('renders the workspace switcher, primary action and palette trigger', async () => {
    render(<JsonBroApp />)

    expect(await screen.findByRole('radiogroup', { name: 'Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Editor' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Tree' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Compare' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Query' })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /Format/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Search commands/i })).toBeInTheDocument()
  })

  it('offers a first-run empty state with three ways in', async () => {
    render(<JsonBroApp />)
    expect(await screen.findByText(/Drop in some JSON to get started/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Paste from clipboard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open file/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try a sample/i })).toBeInTheDocument()
  })

  it('labels every icon-only action for screen readers', async () => {
    render(<JsonBroApp />)
    await screen.findByRole('radiogroup', { name: 'Workspace' })

    for (const name of [
      'Copy document',
      'Save as file…',
      'Open a file…',
      'More actions',
      'Toggle inspector panel',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument()
    }
  })
})

describe('document lifecycle', () => {
  it('validates content and reports status', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"a": 1}')
    expect(await screen.findByText('Valid JSON')).toBeInTheDocument()

    await typeInEditor(user, '{"a": }')
    expect(await screen.findByText('Invalid JSON')).toBeInTheDocument()
  })

  it('explains errors inline with a jump action and a repair offer', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, "{'a': 1}")

    // The report is a compact chip that waits for a pause in typing.
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(alert).toHaveTextContent(/double quotes/i)
    // The chip names the location and doubles as the jump action.
    expect(within(alert).getByRole('button', { name: /line \d+/ })).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Dismiss this message' })).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: /^Fix$/ }))
    await waitFor(() =>
      expect((screen.getByLabelText('JSON editor') as HTMLTextAreaElement).value).toBe(
        '{\n  "a": 1\n}',
      ),
    )
  })

  it('formats and minifies from the toolbar', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"a":[1,2]}')
    await user.click(screen.getByRole('button', { name: /Format/ }))

    const editor = screen.getByLabelText('JSON editor') as HTMLTextAreaElement
    await waitFor(() => expect(editor.value).toContain('\n  "a"'))

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByText('Minify document'))
    await waitFor(() => expect(editor.value).toBe('{"a":[1,2]}'))
  })

  it('sorts keys alphabetically', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"b":1,"a":2}')
    // Sorting is offered only once the document is known to be valid.
    expect(await screen.findByText('Valid JSON')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByText('Sort keys alphabetically'))

    const editor = screen.getByLabelText('JSON editor') as HTMLTextAreaElement
    await waitFor(() => expect(editor.value).toBe('{\n  "a": 2,\n  "b": 1\n}'))
  })

  it('loads the sample document', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await user.click(await screen.findByRole('button', { name: /Try a sample/i }))
    const editor = screen.getByLabelText('JSON editor') as HTMLTextAreaElement
    expect(editor.value).toBe(SAMPLE_JSON)
    expect(await screen.findByText('Valid JSON')).toBeInTheDocument()
  })

  it('clears the document and can restore it', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"keep": true}')
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByText('Clear'))

    const editor = screen.getByLabelText('JSON editor') as HTMLTextAreaElement
    await waitFor(() => expect(editor.value).toBe(''))

    await user.keyboard('{Meta>}{Alt>}z{/Alt}{/Meta}')
    await waitFor(() => expect(editor.value).toBe('{"keep": true}'))
  })

  it('persists content to IndexedDB', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"persisted": 1}')
    await waitFor(async () => expect(await get('json-viewer-input')).toBe('{"persisted": 1}'))
  })

  it('imports a JSON file verbatim, without reformatting it', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)
    await screen.findByLabelText('JSON editor')

    // Deliberately ugly and precision-sensitive: loading must not rewrite either.
    const source = '{"from":"file","id":123456789012345678901234567890,"n":1.0}'
    const file = new File([source], 'data.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Choose a JSON or CSV file'), file)

    await waitFor(() =>
      expect((screen.getByLabelText('JSON editor') as HTMLTextAreaElement).value).toBe(source),
    )
  })

  it('imports a CSV file and converts it to JSON', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)
    await screen.findByLabelText('JSON editor')

    const file = new File(['name,age\nbro,30\n'], 'people.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText('Choose a JSON or CSV file'), file)

    await waitFor(() => {
      const value = (screen.getByLabelText('JSON editor') as HTMLTextAreaElement).value
      expect(JSON.parse(value)).toEqual([{ name: 'bro', age: 30 }])
    })
  })

  it('imports a file dropped onto the workspace', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)
    const workspace = document.getElementById('workspace')!
    await screen.findByLabelText('JSON editor')

    const file = new File(['{"dropped":true}'], 'dropped.json', { type: 'application/json' })
    const dataTransfer = {
      files: [file],
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
      types: ['Files'],
    }

    fireEvent.dragOver(workspace, { dataTransfer })
    expect(await screen.findByText(/Drop a \.json or \.csv file/i)).toBeInTheDocument()

    fireEvent.drop(workspace, { dataTransfer })
    await waitFor(() =>
      expect((screen.getByLabelText('JSON editor') as HTMLTextAreaElement).value).toBe(
        '{"dropped":true}',
      ),
    )
    void user
  })

  it('copies the document to the clipboard', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"copy":true}')
    await user.click(screen.getByRole('button', { name: /Copy document/i }))

    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe('{"copy":true}'),
    )
  })

  it('copies a shareable link that carries the document', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"shared":1}')
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByText('Copy shareable link'))

    await waitFor(async () => {
      const link = await navigator.clipboard.readText()
      expect(link).toContain('#doc=')
    })
  })
})

describe('search', () => {
  it('finds keys and values and reports the match count', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"name":"alpha","nested":{"name":"beta"}}')

    await user.click(screen.getByRole('tab', { name: /Search/ }))
    await user.type(screen.getByLabelText('Search the document'), 'name')

    await waitFor(() => expect(screen.getByText('1 of 2')).toBeInTheDocument())
    expect(screen.getByText('$.name')).toBeInTheDocument()
    expect(screen.getByText('$.nested.name')).toBeInTheDocument()
  })

  it('runs JSONPath queries', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"users":[{"id":1},{"id":2}]}')

    await user.click(screen.getByRole('tab', { name: /Query/ }))
    await user.type(screen.getByLabelText('JSONPath expression'), '..id')

    await waitFor(() => expect(screen.getByText('2 matches')).toBeInTheDocument())
    expect(screen.getByText('$.users[0].id')).toBeInTheDocument()
  })

  it('shows document statistics', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"a":[1,2,3],"b":{"c":true}}')
    await user.click(screen.getByRole('tab', { name: /Stats/ }))

    expect(await screen.findByText('Total nodes')).toBeInTheDocument()
    expect(screen.getByText('Max depth')).toBeInTheDocument()
    expect(screen.getByText('Largest array')).toBeInTheDocument()
  })
})

describe('workspaces', () => {
  it('switches to the tree and browses structure', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"user":{"name":"bro"}}')
    await user.click(screen.getByRole('radio', { name: 'Tree' }))

    expect(await screen.findByRole('tree', { name: 'JSON structure' })).toBeInTheDocument()
    expect(screen.getByText('user')).toBeInTheDocument()
  })

  it('explains why the tree is unavailable for invalid JSON', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await typeInEditor(user, '{"broken"')
    await user.click(screen.getByRole('radio', { name: 'Tree' }))

    expect(await screen.findByText(/appears once the document is valid JSON/i)).toBeInTheDocument()
  })

  it('opens compare mode', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await screen.findByRole('radio', { name: 'Compare' })
    await user.click(screen.getByRole('radio', { name: 'Compare' }))
    expect(await screen.findByTestId('compare-workspace')).toBeInTheDocument()
  })

  it('remembers the last workspace', async () => {
    const user = userEvent.setup()
    const first = render(<JsonBroApp />)
    await user.click(await screen.findByRole('radio', { name: 'Query' }))
    first.unmount()

    render(<JsonBroApp />)
    expect(await screen.findByLabelText('JSONPath expression')).toBeInTheDocument()
  })
})

describe('keyboard and theme', () => {
  it('opens the command palette with the keyboard', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)
    await screen.findByRole('radiogroup', { name: 'Workspace' })

    await user.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByPlaceholderText('Search commands…')).toBeInTheDocument()
  })

  it('opens the shortcuts cheat sheet with ?', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)
    await screen.findByRole('radiogroup', { name: 'Workspace' })

    await user.keyboard('{Shift>}/{/Shift}')
    expect(await screen.findByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })

  it('runs format from its shortcut', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    const editor = await typeInEditor(user, '{"a":1}')
    editor.blur()
    await user.keyboard('{Meta>}{Shift>}f{/Shift}{/Meta}')
    await waitFor(() =>
      expect((editor as HTMLTextAreaElement).value).toBe('{\n  "a": 1\n}'),
    )
  })

  it('toggles the theme and persists the choice', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    await user.click(await screen.findByRole('button', { name: /Theme:/i }))
    await waitFor(() => expect(localStorage.getItem('theme')).toBe('light'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    await user.click(screen.getByRole('button', { name: /Theme:/i }))
    await waitFor(() => expect(localStorage.getItem('theme')).toBe('dark'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggles the inspector', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)

    const toggle = await screen.findByRole('button', { name: 'Toggle inspector panel' })
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument()

    await user.click(toggle)
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument()
  })
})
