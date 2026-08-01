import { Github, Star } from 'lucide-react'
import { useEffect, useState } from 'react'

const GITHUB_REPO_URL = 'https://github.com/sravand123/jsonbro.dev'
const GITHUB_API_URL = 'https://api.github.com/repos/sravand123/jsonbro.dev'
const CACHE_KEY = 'jsonbro:github-stars'
const CACHE_TTL = 24 * 60 * 60 * 1000

interface CachedStars {
  count: number
  fetchedAt: number
}

function readCache(): CachedStars | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedStars
    if (Date.now() - parsed.fetchedAt > CACHE_TTL) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Star count badge.
 *
 * The count is cached for a day, so a normal session makes no third-party request
 * at all. A blocked, offline or rate-limited request is an expected condition, not
 * an error: the count is simply omitted. It used to log to the console, which
 * polluted the console for anyone offline or behind a content blocker.
 */
export function GitHubStars() {
  const [stars, setStars] = useState<number | null>(() => readCache()?.count ?? null)

  useEffect(() => {
    if (readCache()) return
    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch(GITHUB_API_URL, { signal: controller.signal })
        if (!response.ok) return
        const data = (await response.json()) as { stargazers_count?: number }
        if (typeof data.stargazers_count !== 'number') return
        setStars(data.stargazers_count)
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ count: data.stargazers_count, fetchedAt: Date.now() }),
          )
        } catch {
          // Storage unavailable; the count just will not be cached.
        }
      } catch {
        // Offline, rate limited, or blocked — show the link without a count.
      }
    })()

    return () => controller.abort()
  }, [])

  return (
    <a
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 px-2 text-2xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
    >
      <Github className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">Star jsonbro.dev on GitHub</span>
      {stars !== null && (
        <>
          <Star className="h-3 w-3 fill-current" aria-hidden="true" />
          <span className="tabular-nums" aria-label={`${stars} stars on GitHub`}>
            {stars.toLocaleString()}
          </span>
        </>
      )}
    </a>
  )
}
