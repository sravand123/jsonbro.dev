export type Workspace = 'editor' | 'tree' | 'compare' | 'query'

export const WORKSPACES: Workspace[] = ['editor', 'tree', 'compare', 'query']

export type InspectorTab = 'search' | 'stats' | 'query'

const WORKSPACE_KEY = 'jsonbro:workspace'
const INSPECTOR_KEY = 'jsonbro:inspector-open'

/**
 * The workspace to open on load.
 *
 * A `?w=` parameter wins over the stored preference so that a link can land someone
 * directly in the right tool — the static landing pages under /json-diff and friends rely
 * on this. Anything unrecognised falls back to the stored preference rather than throwing
 * the visitor into an arbitrary workspace.
 */
export function readWorkspace(): Workspace {
  const fromUrl = readWorkspaceParam()
  if (fromUrl) return fromUrl
  if (typeof localStorage === 'undefined') return 'editor'
  const stored = localStorage.getItem(WORKSPACE_KEY)
  return WORKSPACES.includes(stored as Workspace) ? (stored as Workspace) : 'editor'
}

/** Reads `?w=compare` (and the longer `?workspace=`) if present and valid. */
function readWorkspaceParam(): Workspace | null {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const requested = params.get('w') ?? params.get('workspace')
    return WORKSPACES.includes(requested as Workspace) ? (requested as Workspace) : null
  } catch {
    return null
  }
}

export function writeWorkspace(workspace: Workspace) {
  try {
    localStorage.setItem(WORKSPACE_KEY, workspace)
  } catch {
    // Storage may be unavailable in private modes; preference is non-critical.
  }
}

export function readInspectorOpen(defaultValue: boolean): boolean {
  if (typeof localStorage === 'undefined') return defaultValue
  const stored = localStorage.getItem(INSPECTOR_KEY)
  if (stored === null) return defaultValue
  return stored === '1'
}

export function writeInspectorOpen(open: boolean) {
  try {
    localStorage.setItem(INSPECTOR_KEY, open ? '1' : '0')
  } catch {
    // Ignore.
  }
}
