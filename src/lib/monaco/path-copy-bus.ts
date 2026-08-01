/**
 * Tiny event bus for "Copy path" clicks inside Monaco's hover card.
 *
 * Deliberately free of Monaco imports: the app shell subscribes to this, and if
 * it pulled in setup.ts the whole Monaco chunk would become a static dependency
 * of the entry bundle and defeat lazy loading.
 */
type PathCopyListener = (path: string, ok: boolean) => void

const listeners = new Set<PathCopyListener>()

export function onPathCopied(listener: PathCopyListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitPathCopied(path: string, ok: boolean) {
  for (const listener of listeners) listener(path, ok)
}
