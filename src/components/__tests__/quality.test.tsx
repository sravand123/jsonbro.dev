import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { clear } from 'idb-keyval'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JsonBroApp } from '@/components/JsonBroApp'
import { analyze, search } from '@/lib/analysis'
import { REPAIR_PROBE_LIMIT } from '@/workers/protocol'

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
  return { CompareWorkspace: () => createElement('div', null, 'compare') }
})

/** Rules that cannot be evaluated meaningfully in jsdom (no layout, no painting). */
const DISABLED_RULES = {
  'color-contrast': { enabled: false },
  'scrollable-region-focusable': { enabled: false },
}

async function auditAccessibility(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: DISABLED_RULES,
    resultTypes: ['violations'],
  })
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.length,
    help: violation.help,
  }))
}

beforeEach(async () => {
  localStorage.clear()
  await clear()
})

describe('accessibility', () => {
  it('has no axe violations on the default shell', async () => {
    const { container } = render(<JsonBroApp />)
    await screen.findByRole('radiogroup', { name: 'Workspace' })
    expect(await auditAccessibility(container)).toEqual([])
  })

  it('has no axe violations with a document loaded and an error showing', async () => {
    const user = userEvent.setup()
    const { container } = render(<JsonBroApp />)

    const editor = await screen.findByLabelText('JSON editor')
    await user.clear(editor)
    await user.paste("{'bad': 1}")
    // The error is reported in the status bar; wait for it before auditing.
    await screen.findByText('Invalid JSON')
    await screen.findByTitle(/double quotes/i, {}, { timeout: 3000 })

    expect(await auditAccessibility(container)).toEqual([])
  })

  it('has no axe violations in the tree workspace', async () => {
    const user = userEvent.setup()
    const { container } = render(<JsonBroApp />)

    const editor = await screen.findByLabelText('JSON editor')
    await user.clear(editor)
    await user.paste('{"user":{"name":"bro"},"tags":["a"]}')
    await user.click(screen.getByRole('radio', { name: 'Tree' }))
    await screen.findByRole('tree')

    expect(await auditAccessibility(container)).toEqual([])
  })

  it('has no axe violations in the command palette', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)
    await screen.findByRole('radiogroup', { name: 'Workspace' })

    await user.click(screen.getByRole('button', { name: /Search commands/i }))
    await screen.findByPlaceholderText('Search commands…')

    // The palette renders in a portal, so audit the whole document.
    expect(await auditAccessibility(document.body)).toEqual([])
  })

  it('has no axe violations in the settings dialog', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)
    await screen.findByRole('radiogroup', { name: 'Workspace' })

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByText('Editor settings'))
    await screen.findByRole('heading', { name: 'Settings' })

    expect(await auditAccessibility(document.body)).toEqual([])
  })

  it('traps focus in dialogs and restores it on close', async () => {
    const user = userEvent.setup()
    render(<JsonBroApp />)
    const trigger = await screen.findByRole('button', { name: /Search commands/i })

    trigger.focus()
    await user.click(trigger)
    const input = await screen.findByPlaceholderText('Search commands…')
    await waitFor(() => expect(input).toHaveFocus())

    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('exposes a skip link to the workspace', async () => {
    render(<JsonBroApp />)
    const skip = await screen.findByRole('link', { name: /Skip to editor/i })
    expect(skip).toHaveAttribute('href', '#workspace')
  })
})

describe('large document handling', () => {
  const buildDocument = (items: number) =>
    JSON.stringify(
      Array.from({ length: items }, (_, index) => ({
        id: index,
        name: `item-${index}`,
        active: index % 2 === 0,
        tags: ['alpha', 'beta'],
      })),
    )

  it('analyses a 50k-node document quickly', () => {
    const document = buildDocument(10_000)
    const started = performance.now()
    const result = analyze(document)
    const elapsed = performance.now() - started

    expect(result.status).toBe('valid')
    expect(result.stats.nodes).toBeGreaterThan(50_000)
    // Comfortably inside the 400ms interaction budget, before any worker offload.
    expect(elapsed).toBeLessThan(400)
  })

  it('searches a large document quickly and caps the result set', () => {
    const document = buildDocument(10_000)
    const started = performance.now()
    const result = search(
      document,
      'alpha',
      { caseSensitive: false, wholeWord: false, useRegex: false, scope: 'both' },
      200,
    )
    const elapsed = performance.now() - started

    expect(result.matches).toHaveLength(200)
    // One "alpha" per item, in the tags array.
    expect(result.total).toBe(10_000)
    expect(result.truncated).toBe(true)
    expect(elapsed).toBeLessThan(1500)
  })

  it('skips the repair probe for documents beyond the size limit', () => {
    const oversized = `{"a": ${'"x"'.repeat(1)}${' '.repeat(REPAIR_PROBE_LIMIT)}`
    const result = analyze(oversized)
    expect(result.status).toBe('invalid')
    expect(result.repairProbeSkipped).toBe(true)
    expect(result.canRepair).toBe(false)
  })

  it('handles deeply nested documents without exhausting the stack', () => {
    const depth = 5_000
    const deep = `${'['.repeat(depth)}1${']'.repeat(depth)}`
    const result = analyze(deep)
    expect(result.status).toBe('valid')
    expect(result.stats.depth).toBe(depth + 1)
  })
})
