import { expect, test, type Page } from '@playwright/test'

/**
 * These run against the built app in a real browser, so Monaco, the web worker,
 * IndexedDB persistence and the keyboard layer are all the genuine article.
 */

const isMac = process.platform === 'darwin'
const MOD = isMac ? 'Meta' : 'Control'

async function fresh(page: Page) {
  const errors: string[] = []
  const ignorable = (text: string) =>
    // Third-party rate limiting (api.github.com) is logged by the browser itself
    // and is outside the app's control.
    /api\.github\.com|status of 403/.test(text)
  page.on('console', (message) => {
    if (message.type() === 'error' && !ignorable(message.text())) errors.push(message.text())
  })
  page.on('pageerror', (error) => {
    if (!ignorable(error.message)) errors.push(error.message)
  })

  await page.goto('/')
  await page.evaluate(async () => {
    localStorage.clear()
    const databases = (await indexedDB.databases?.()) ?? []
    await Promise.all(
      databases.map(
        (database) =>
          new Promise<void>((resolve) => {
            if (!database.name) return resolve()
            const request = indexedDB.deleteDatabase(database.name)
            request.onsuccess = () => resolve()
            request.onerror = () => resolve()
            request.onblocked = () => resolve()
          }),
      ),
    )
  })
  await page.reload()
  await expect(page.getByRole('button', { name: /Format/ })).toBeVisible()
  return errors
}

async function focusEditor(page: Page, nth = 0) {
  // Monaco 0.54 uses the EditContext API rather than a textarea, so the only way
  // in is a real click. Click near the top of the editor, clear of the
  // empty-state call to action that sits in the middle.
  const editor = page.locator('.monaco-editor').nth(nth)
  await expect(editor).toBeVisible()
  await editor.click({ position: { x: 150, y: 10 } })
}

/**
 * Monaco's idea of the platform modifier, which is not necessarily the host's.
 *
 * `devices['Desktop Chrome']` sends a Windows user agent even on macOS, and Monaco resolves
 * its own `CtrlCmd` bindings from that string — so select-all inside the editor is Ctrl+A
 * here while the app's shortcuts still answer to Meta. Getting this wrong is silent: the
 * selection simply does not happen and the next keystrokes append to the old document.
 */
async function monacoModifier(page: Page) {
  return page.evaluate(() => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? 'Meta' : 'Control'))
}

async function setDocument(page: Page, value: string, nth = 0) {
  await focusEditor(page, nth)
  const mod = await monacoModifier(page)
  await page.keyboard.press(`${mod}+a`)
  await page.keyboard.press('Delete')
  await page.keyboard.type(value)
  await expect(page.locator('.view-line').first()).not.toHaveText('')
}


async function isCompact(page: Page) {
  const size = page.viewportSize()
  return (size?.width ?? 1440) < 768
}

/** Workspaces are a segmented control on desktop and a dropdown on phones. */
async function selectWorkspace(page: Page, name: 'Editor' | 'Tree' | 'Compare' | 'Query') {
  if (await isCompact(page)) {
    await page.getByRole('button', { name: /^(Editor|Tree|Compare|Query)$/ }).click()
    await page.getByRole('menuitem', { name }).click()
  } else {
    await page.getByRole('radio', { name }).click()
  }
}

/** The inspector is a docked panel on desktop and a sheet on phones. */
async function openInspectorTab(page: Page, name: 'Search' | 'Query' | 'Stats') {
  const panel = page.getByRole('complementary', { name: 'Inspector' })
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'Toggle inspector panel' }).click()
  }
  await page.getByRole('tab', { name: new RegExp(name) }).click()
}

async function toggleTheme(page: Page) {
  const direct = page.getByRole('button', { name: /Theme:/i })
  if (await direct.isVisible()) {
    await direct.click()
    return
  }
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'light' }).click()
}

test.describe('editor workspace', () => {
  test('boots without console errors and shows the empty state', async ({ page }) => {
    const errors = await fresh(page)

    await expect(page.getByText('Drop in some JSON to get started')).toBeVisible()
    await expect(page.getByRole('button', { name: /Try a sample/i })).toBeVisible()
    await expect(page.locator('.monaco-editor').first()).toBeVisible()

    expect(errors).toEqual([])
  })

  test('loads the sample, validates it, and applies our syntax theme', async ({ page }) => {
    await fresh(page)
    await page.getByRole('button', { name: /Try a sample/i }).click()

    await expect(page.getByText('Valid JSON')).toBeVisible()
    await expect(page.getByText(/nodes/)).toBeVisible()

    const colours = await page.evaluate(() =>
      Array.from(
        new Set(
          Array.from(document.querySelectorAll('.view-line span span'))
            .map((span) => getComputedStyle(span).color)
            .filter(Boolean),
        ),
      ),
    )
    expect(colours.length).toBeGreaterThan(2)
  })

  test('formats and minifies a document', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"b":[1,2],"a":"x"}')

    await page.getByRole('button', { name: /Format/ }).click()
    await expect(page.locator('.view-line').nth(1)).toContainText('"b"')

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByText('Minify document').click()
    await expect(page.locator('.view-line').first()).toContainText('{"b":[1,2],"a":"x"}')
  })

  test('reports a friendly error in the status bar and jumps to it', async ({ page }) => {
    await fresh(page)
    await setDocument(page, "{'a': 1,}")

    /*
      The report lives in the status bar: always visible, never covering the code it
      describes. Earlier versions floated a panel over the editor, which had to be shrunk
      twice and still sat on top of the lines in question.
    */
    const report = page.locator('footer button[title*="go to line"]')
    await expect(report).toBeVisible()
    await expect(report).toContainText('Invalid JSON')
    await expect(report).toContainText(/line \d+/)

    // Nothing floats above the editor any more.
    expect(await page.locator('.monaco-editor [role="alert"]').count()).toBe(0)

    await report.click()
    await expect(page.locator('footer')).toContainText('Ln 1')
  })

  test('the toolbar offers repair while a fix is available', async ({ page }) => {
    await fresh(page)

    /*
      Formatting cannot succeed on a document that does not parse, so the primary slot
      offers the action that can: repair. This used to live only in the palette, the
      overflow menu and behind a hover, which made the recovery action hard to find at the
      moment it was needed.
    */
    const format = page.getByRole('button', { name: 'Format document' })
    const repair = page.getByRole('button', { name: 'Repair invalid JSON' })

    await setDocument(page, '{"a": 1}')
    await expect(format).toBeVisible()
    await expect(repair).toHaveCount(0)

    await setDocument(page, "{'a': 1,}")
    await expect(repair).toBeVisible()
    await expect(format).toHaveCount(0)

    await repair.click()
    await expect(page.getByText('Valid JSON')).toBeVisible()
    // Once repaired, the slot goes back to the everyday action.
    await expect(format).toBeVisible()
    await expect(repair).toHaveCount(0)
  })

  test('reports the JSON path of the caret', async ({ page }) => {
    await fresh(page)
    await page.getByRole('button', { name: /Try a sample/i }).click()

    await page.getByText('"monaco"').click()
    await expect(page.getByRole('navigation', { name: 'JSON path' })).toContainText('engine')
  })
})

test.describe('command palette and shortcuts', () => {
  test('opens with the keyboard and runs a command', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"z":1,"a":2}')
    await expect(page.getByText('Valid JSON')).toBeVisible()

    await page.keyboard.press(`${MOD}+k`)
    const palette = page.getByPlaceholder('Search commands…')
    await expect(palette).toBeVisible()

    await palette.fill('sort')
    await page.keyboard.press('Enter')

    await expect(page.locator('.view-line').nth(1)).toContainText('"a"')
  })

  test('shows the cheat sheet with ?', async ({ page }) => {
    await fresh(page)
    await page.locator('footer').click()
    await page.keyboard.press('Shift+Slash')
    await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible()
    await expect(page.getByText('Format document')).toBeVisible()
  })

  test('format shortcut works while the editor has focus', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"a":1}')
    await focusEditor(page)
    await page.keyboard.press(`${MOD}+Shift+f`)
    await expect(page.locator('.view-line').nth(1)).toContainText('"a"')
  })
})

test.describe('search and query', () => {
  test('finds matches and reveals them in the editor', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"name":"alpha","nested":{"name":"beta"}}')

    await page.keyboard.press(`${MOD}+f`)
    const input = page.getByLabel('Search the document')
    await expect(input).toBeFocused()
    await input.fill('name')

    await expect(page.getByText('1 of 2')).toBeVisible()
    await page.getByText('$.nested.name').click()
    await expect(page.getByText('2 of 2')).toBeVisible()
    await expect(page.locator('.jb-search-match-active').first()).toBeVisible()
  })

  // Regression: revealing a match focused the editor, so the first Enter navigated
  // but threw focus into the document — and every Enter after that typed a newline
  // into the user's JSON.
  test('Enter and Shift+Enter step through matches without touching the document', async ({
    page,
  }) => {
    await fresh(page)
    await setDocument(page, '{"name":"a","nested":{"name":"b"},"list":["name","x"]}')

    const lineCount = () => page.locator('.view-line').count()
    const before = await lineCount()

    await page.keyboard.press(`${MOD}+f`)
    const box = page.getByLabel('Search the document')
    await box.fill('name')
    await expect(page.getByText('1 of 3')).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(page.getByText('2 of 3')).toBeVisible()
    await expect(box).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(page.getByText('3 of 3')).toBeVisible()

    // Wraps around, still in the box.
    await page.keyboard.press('Enter')
    await expect(page.getByText('1 of 3')).toBeVisible()
    await expect(box).toBeFocused()

    await page.keyboard.press('Shift+Enter')
    await expect(page.getByText('3 of 3')).toBeVisible()
    await expect(box).toBeFocused()

    // Arrow keys are the other convention people reach for.
    await page.keyboard.press('ArrowDown')
    await expect(page.getByText('1 of 3')).toBeVisible()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByText('3 of 3')).toBeVisible()
    await expect(box).toBeFocused()

    // The document must be untouched by all that navigating.
    expect(await lineCount()).toBe(before)
  })

  test('selecting a result with the mouse moves focus into the editor', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"name":"a","nested":{"name":"b"}}')

    await page.keyboard.press(`${MOD}+f`)
    await page.getByLabel('Search the document').fill('name')
    await expect(page.getByText('1 of 2')).toBeVisible()

    await page.getByRole('list', { name: 'Search results' }).getByRole('button').nth(1).click()
    await expect(page.locator('.monaco-editor.focused')).toHaveCount(1)
  })

  test('runs a JSONPath query', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"users":[{"id":1},{"id":2},{"id":3}]}')

    await openInspectorTab(page, 'Query')
    await page.getByLabel('JSONPath expression').fill('$..id')
    await expect(page.getByText('3 matches')).toBeVisible()
  })
})

test.describe('tree workspace', () => {
  test('browses, expands and edits values', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"user":{"name":"bro","age":30},"tags":["a","b"]}')
    await expect(page.getByText('Valid JSON')).toBeVisible()

    await selectWorkspace(page, 'Tree')
    await expect(page.getByRole('tree', { name: 'JSON structure' })).toBeVisible()

    await page.getByRole('button', { name: 'Expand' }).first().click()
    await expect(page.getByText('name', { exact: true })).toBeVisible()

    // Selecting a row keeps you in the tree and reveals its row actions.
    await page.getByRole('treeitem').filter({ hasText: 'age' }).first().click()
    await expect(page.getByRole('tree', { name: 'JSON structure' })).toBeVisible()
    await page.getByRole('button', { name: 'Edit value at $.user.age' }).click()
    const input = page.getByLabel('New value for $.user.age')
    await input.fill('31')
    await input.press('Enter')

    await selectWorkspace(page, 'Editor')
    await expect(page.locator('.monaco-editor').first()).toContainText('31')
  })
})

test.describe('compare workspace', () => {
  // Regression: search, query and statistics were bound to the main editor's
  // document, so in Compare they reported nothing for the text on screen and
  // found matches in a document the user could not see.
  test('the inspector follows the focused pane, not the hidden main document', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"mainOnly":"alpha"}')

    await selectWorkspace(page, 'Compare')
    await setDocument(page, '{"leftValue":"beta"}', 0)
    await setDocument(page, '{"rightValue":"gamma"}', 1)

    await openInspectorTab(page, 'Search')
    const search = page.getByLabel('Search the document')
    const results = page.getByRole('list', { name: 'Search results' })
    const sideSelector = page.getByRole('radiogroup', { name: 'Inspect which side' })

    // The right pane was focused last, so the inspector points at it.
    await expect(sideSelector.getByRole('radio', { name: 'Changed' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await search.fill('gamma')
    await expect(results).toContainText('$.rightValue')

    // The side can also be chosen explicitly, which is the only way on phones
    // where the inspector sheet covers both panes.
    await sideSelector.getByRole('radio', { name: 'Original' }).click()
    await search.fill('beta')
    await expect(results).toContainText('$.leftValue')

    // The main document must not leak into compare results.
    await search.fill('alpha')
    await expect(results).not.toContainText('$.mainOnly')
    await expect(page.getByText('No results')).toBeVisible()
  })

  test('transforms apply to the focused pane', async ({ page }) => {
    await fresh(page)
    await selectWorkspace(page, 'Compare')
    await setDocument(page, '{"b":1,"a":2}', 0)
    await setDocument(page, '{"z":9}', 1)

    // Focus the left pane, then format: only that pane should change.
    await focusEditor(page, 0)
    await page.keyboard.press(`${MOD}+Shift+f`)

    const leftPane = page.getByRole('region', { name: 'Original' })
    const rightPane = page.getByRole('region', { name: 'Changed' })
    await expect(leftPane.locator('.view-line')).toHaveCount(4)
    await expect(rightPane.locator('.view-line')).toHaveCount(1)
  })

  // Regression: the diff view had different chrome and a wider gutter than the edit
  // panes (Monaco forces a glyph margin on the original side), so switching modes moved
  // the code both vertically and sideways.
  test('switching between edit and diff does not move the code', async ({ page }) => {
    await fresh(page)
    await selectWorkspace(page, 'Compare')
    await setDocument(page, '{\n  "a": 1,\n  "b": 2\n}', 0)
    await setDocument(page, '{\n  "a": 9,\n  "b": 2\n}', 1)

    // Left edge of the code, relative to each editor.
    const gutters = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('.view-lines')).map((view) => {
          const host = view.closest('.monaco-editor')!.getBoundingClientRect()
          return Math.round(view.getBoundingClientRect().left - host.left)
        }),
      )
    // Top of the code region, which the pane header/footer chrome used to change.
    const codeTop = () =>
      page.evaluate(() => Math.round(document.querySelector('.view-lines')!.getBoundingClientRect().top))

    const editGutters = await gutters()
    const editTop = await codeTop()

    await page.getByRole('button', { name: /Show differences/ }).click()
    // The diff is held back for a frame while Monaco's forced glyph margin is overridden.
    await expect(page.locator('[data-diff-ready="true"]')).toBeVisible()

    for (const gutter of await gutters()) expect(Math.abs(gutter - editGutters[0])).toBeLessThanOrEqual(1)
    expect(Math.abs((await codeTop()) - editTop)).toBeLessThanOrEqual(1)

    await page.getByRole('radio', { name: 'Edit', exact: true }).click()
    await page.waitForTimeout(600)
    for (const gutter of await gutters()) expect(Math.abs(gutter - editGutters[0])).toBeLessThanOrEqual(1)
    expect(Math.abs((await codeTop()) - editTop)).toBeLessThanOrEqual(1)
  })

  // Regression: the diff is read-only, so keystrokes vanished with no explanation.
  test('typing in the read-only diff returns to Edit on that side', async ({ page }) => {
    await fresh(page)
    await selectWorkspace(page, 'Compare')
    await setDocument(page, '{"a":1}', 0)
    await setDocument(page, '{"a":9}', 1)

    await page.getByRole('button', { name: /Show differences/ }).click()
    await expect(page.locator('.monaco-diff-editor')).toBeVisible()

    // Phones render the diff unified, where only the modified editor exists.
    const modified = page.locator('.monaco-diff-editor .editor.modified')
    const target = (await modified.count()) > 0 ? modified : page.locator('.monaco-diff-editor')
    await target.first().click({ position: { x: 100, y: 14 } })
    await page.keyboard.type('z')

    await expect(page.getByRole('radio', { name: 'Edit', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    // The inspector retargets to the side that was touched, where it is on screen.
    const sideSelector = page.getByRole('radiogroup', { name: 'Inspect which side' })
    if (await sideSelector.isVisible()) {
      await expect(sideSelector.getByRole('radio', { name: 'Changed' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    }

    // The stray keystroke must not have landed in either document.
    await expect(page.getByRole('region', { name: 'Changed' })).toContainText('{"a":9}')
    await expect(page.getByRole('region', { name: 'Original' })).toContainText('{"a":1}')
  })

  test('diffs two documents', async ({ page }) => {
    await fresh(page)
    await selectWorkspace(page, 'Compare')

    await setDocument(page, '{"a":1,"b":2}', 0)
    await setDocument(page, '{"b":2,"a":9}', 1)

    await page.getByRole('radio', { name: 'Diff' }).click()
    await expect(page.locator('.monaco-diff-editor')).toBeVisible()
  })
})

test.describe('sharing', () => {
  test('encodes the document into a link and restores it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await fresh(page)
    await setDocument(page, '{"shared":true}')
    await expect(page.getByText('Valid JSON')).toBeVisible()

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Copy shareable link' }).click()

    const link = await page.evaluate(() => navigator.clipboard.readText())
    expect(link).toContain('#doc=')

    // A fresh visit to that link restores the document, and the payload never
    // leaves the fragment.
    await page.evaluate(async () => {
      localStorage.clear()
      const dbs = (await indexedDB.databases?.()) ?? []
      await Promise.all(
        dbs.map((db) => new Promise<void>((resolve) => {
          if (!db.name) return resolve()
          const request = indexedDB.deleteDatabase(db.name)
          request.onsuccess = () => resolve()
          request.onerror = () => resolve()
          request.onblocked = () => resolve()
        })),
      )
    })
    // A fragment-only navigation would not reload the app, so go away first.
    await page.goto('about:blank')
    await page.goto(link)
    await expect(page.locator('.monaco-editor').first()).toContainText('shared')
    // The app consumes the fragment and cleans the URL so the payload is not
    // left sitting in the address bar or in history.
    await expect.poll(() => page.url()).not.toContain('#doc=')
  })
})

test.describe('shortcut isolation', () => {
  // Regression: `mod+comma` was mis-parsed by hotkeys-js as the letter `c`, so
  // pressing ⌘C inside the editor opened the settings dialog.
  test('⌘C copies inside the editor without opening a dialog', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"a":1}')
    await focusEditor(page)

    await page.keyboard.press(`${MOD}+a`)
    await page.keyboard.press(`${MOD}+c`)
    await page.waitForTimeout(300)

    await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  })

  test('⌘, opens settings, ⌘K the palette, from inside the editor', async ({ page }) => {
    await fresh(page)
    await focusEditor(page)

    await page.keyboard.press(`${MOD}+Comma`)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.keyboard.press('Escape')

    await focusEditor(page)
    await page.keyboard.press(`${MOD}+k`)
    await expect(page.getByPlaceholder('Search commands…')).toBeVisible()
  })

  // Regression: Monaco kept its own ⌘F binding, so the find widget opened at the
  // same time as the app's search panel.
  test('⌘F opens only the app search panel', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"name":"a"}')
    await focusEditor(page)

    await page.keyboard.press(`${MOD}+f`)
    await expect(page.getByLabel('Search the document')).toBeFocused()
    expect(await page.locator('.find-widget.visible').count()).toBe(0)
  })

  test('⌥⌘F opens Monaco find and replace', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"name":"a"}')
    await focusEditor(page)

    // Monaco resolves CtrlCmd from the *user agent*, and binds only that one
    // modifier. Playwright's device descriptors send a Windows/Android UA even on
    // macOS, so ask the page rather than assuming the host platform. (The app's own
    // shortcuts accept either modifier, which is why they pass on every device.)
    const monacoMod = await page.evaluate(() =>
      /Macintosh|Mac OS X|iPhone|iPad/i.test(navigator.userAgent) ? 'Meta' : 'Control',
    )

    await page.keyboard.press(`Alt+${monacoMod}+f`)
    await expect(page.locator('.find-widget.visible')).toHaveCount(1)
  })

  test('unmodified keys type text instead of triggering actions', async ({ page }) => {
    await fresh(page)
    await focusEditor(page)
    await page.keyboard.press(`${MOD}+a`)
    await page.keyboard.press('Delete')

    // f=find, k=palette, b=inspector, s=save, ?=cheat sheet as modified shortcuts.
    await page.keyboard.type('fkbs')
    await page.keyboard.press('Shift+Slash')

    await expect(page.locator('.view-line').first()).toContainText('fkbs?')
    await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  })
})

test.describe('layout stability', () => {
  // Regression: DialogContent centres itself with -translate-x-1/2/-translate-y-1/2,
  // while the open animation also animated `transform`. The animation replaced the
  // centering translate, so dialogs appeared below and right of centre and then
  // snapped into place.
  test('dialogs stay centred for every frame of the open animation', async ({ page }) => {
    await fresh(page)

    const samples = await page.evaluate(async () => {
      const frames: Array<{ cx: number; cy: number }> = []
      const collect = () =>
        new Promise<void>((resolve) => {
          const tick = () => {
            const el = document.querySelector('[role="dialog"]')
            if (el) {
              const r = el.getBoundingClientRect()
              frames.push({ cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) })
            }
            if (frames.length < 12) requestAnimationFrame(tick)
            else resolve()
          }
          requestAnimationFrame(tick)
        })
      const started = collect()
      document.querySelector<HTMLElement>('button[aria-label="Search commands"]')?.click()
      await started
      return { frames, width: window.innerWidth, height: window.innerHeight }
    })

    expect(samples.frames.length).toBeGreaterThan(3)
    const expectedX = Math.round(samples.width / 2)
    const expectedY = Math.round(samples.height / 2)
    for (const frame of samples.frames) {
      expect(Math.abs(frame.cx - expectedX)).toBeLessThanOrEqual(3)
      expect(Math.abs(frame.cy - expectedY)).toBeLessThanOrEqual(3)
    }
  })

  // Regression: the error banner was a flow element, so the editor resized by
  // ~45px every time the document flipped between valid and invalid while typing.
  test('the editor does not resize when validity changes', async ({ page }) => {
    await fresh(page)
    await focusEditor(page)
    await page.keyboard.press(`${MOD}+a`)
    await page.keyboard.press('Delete')

    const editorHost = page.locator('[data-testid="json-editor"]')
    const heights = new Set<number>()

    for (const chunk of ['{"a":1', ',', '"b"', ':2', '}']) {
      await page.keyboard.type(chunk)
      await page.waitForTimeout(700)
      const box = await editorHost.boundingBox()
      heights.add(Math.round(box!.height))
    }

    expect(heights.size).toBe(1)
  })

  test('reporting an error neither resizes nor covers the editor', async ({ page }) => {
    await fresh(page)

    /*
      The invariant this protects has outlived three designs of the report: a full-width bar
      in the layout that resized the editor on every keystroke, a floating pill on top of the
      code, and now a line in the status bar. Whatever the presentation, becoming invalid
      must not move the code or sit on it.
    */
    await setDocument(page, '{"a": 1}')
    await expect(page.getByText('Valid JSON')).toBeVisible()
    const editor = page.locator('[data-testid="json-editor"]')
    const before = await editor.boundingBox()

    await setDocument(page, "{'a': 1}")
    await expect(page.locator('footer button[title*="go to line"]')).toBeVisible({
      timeout: 5000,
    })

    const after = await editor.boundingBox()
    expect(Math.round(after!.height)).toBe(Math.round(before!.height))
    expect(Math.round(after!.y)).toBe(Math.round(before!.y))
    expect(await page.locator('.monaco-editor [role="alert"]').count()).toBe(0)
  })
})

test.describe('persistence and theme', () => {
  test('restores the document after a reload', async ({ page }) => {
    await fresh(page)
    await setDocument(page, '{"persisted":true}')
    await expect(page.getByText('Valid JSON')).toBeVisible()

    await page.reload()
    await expect(page.locator('.monaco-editor').first()).toContainText('persisted')
  })

  test('switches theme and keeps it after a reload', async ({ page }) => {
    await fresh(page)
    await toggleTheme(page)

    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
})

test.describe('layout', () => {
  test('does not overflow the viewport', async ({ page }, testInfo) => {
    await fresh(page)
    await page.getByRole('button', { name: /Try a sample/i }).click()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Toggle inspector panel' }).click()
    }
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible()
  })
})

/*
  The landing pages are generated at build time, so they only exist in dist — which is what
  this suite runs against. They are the site's only crawlable text, so a build that silently
  stops emitting them should fail here rather than in Search Console weeks later.
*/
test.describe('static landing pages', () => {
  const pages = [
    { slug: 'json-formatter', workspace: 'Editor' },
    { slug: 'json-validator', workspace: 'Editor' },
    { slug: 'json-diff', workspace: 'Compare' },
    { slug: 'jsonpath-tester', workspace: 'Query' },
    { slug: 'json-to-csv', workspace: 'Editor' },
    { slug: 'json-viewer', workspace: 'Tree' },
  ]

  for (const { slug, workspace } of pages) {
    test(`/${slug}/ is crawlable and opens the ${workspace} workspace`, async ({
      page,
    }, testInfo) => {
      const response = await page.goto(`/${slug}/`)
      expect(response?.status()).toBe(200)

      // Exactly one h1, and real prose rather than an app shell.
      await expect(page.locator('h1')).toHaveCount(1)
      const words = await page.evaluate(
        () => document.body.textContent!.trim().split(/\s+/).length,
      )
      expect(words).toBeGreaterThan(250)

      // Structured data must parse and describe this page.
      const ld = await page.evaluate(() => {
        const node = document.querySelector('script[type="application/ld+json"]')
        return JSON.parse(node!.textContent!)
      })
      const types = ld['@graph'].map((entry: { '@type': string }) => entry['@type'])
      expect(types).toContain('FAQPage')
      expect(types).toContain('BreadcrumbList')

      const canonical = await page.locator('link[rel=canonical]').getAttribute('href')
      expect(canonical).toBe(`https://jsonbro.dev/${slug}/`)

      // The call to action has to land in the workspace the page is about. Which control
      // reports that differs: a segmented radio on desktop, a dropdown trigger labelled
      // with the current workspace on small screens.
      await page.getByRole('link', { name: /Open the/ }).click()
      if (testInfo.project.name === 'mobile') {
        await expect(page.getByRole('button', { name: workspace, exact: true })).toBeVisible()
      } else {
        await expect(page.getByRole('radio', { name: workspace })).toHaveAttribute(
          'aria-checked',
          'true',
        )
      }
    })
  }

  test('the sitemap lists every page with the build date', async ({ page }) => {
    const response = await page.goto('/sitemap.xml')
    expect(response?.status()).toBe(200)
    const xml = await response!.text()

    for (const { slug } of pages) {
      expect(xml).toContain(`https://jsonbro.dev/${slug}/`)
    }
    expect(xml).toContain('<loc>https://jsonbro.dev/</loc>')
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/)
  })
})
