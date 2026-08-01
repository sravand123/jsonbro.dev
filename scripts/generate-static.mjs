/**
 * Renders the static landing pages and the sitemap into dist/ after a build.
 *
 * Generated rather than hand-written so that the six pages cannot drift apart, and so the
 * sitemap always lists exactly the pages that exist with the date they were built. They are
 * plain HTML with inlined CSS and no JavaScript: the fastest thing a crawler or a person on
 * a slow connection can receive, and there is nothing on them that needs a framework.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PAGES, SITE } from './site-pages.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

/** Today, as YYYY-MM-DD, for <lastmod>. */
const today = new Date().toISOString().slice(0, 10)

const escape = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/*
  Inlined so a landing page costs exactly one request. Values mirror the design tokens in
  src/index.css; the pages are dark-only because they are read for seconds on the way into
  the app, and a theme toggle here would need JavaScript.
*/
const CSS = `
*, *::before, *::after { box-sizing: border-box; }
:root { color-scheme: dark; }
body {
  margin: 0; padding: 0 1.25rem 4rem;
  background: #0b0f16; color: #e8edf5;
  font: 16px/1.65 Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
main, header, footer { max-width: 46rem; margin: 0 auto; }
header { display: flex; align-items: center; gap: .75rem; padding: 1.25rem 0; }
.brand { display: inline-flex; align-items: center; gap: .5rem; color: #e8edf5; font-weight: 600; text-decoration: none; }
.brand svg { width: 1.125rem; height: 1.125rem; }
.cta {
  display: inline-block; margin: 1.5rem 0 .5rem; padding: .625rem 1.125rem;
  background: #22c55e; color: #052e16; font-weight: 600; border-radius: .5rem; text-decoration: none;
}
.cta:hover { background: #16a34a; }
h1 { font-size: 1.9rem; line-height: 1.2; letter-spacing: -.02em; margin: 1rem 0 .75rem; }
h2 { font-size: 1.15rem; letter-spacing: -.01em; margin: 2.25rem 0 .5rem; }
p, ul, table, pre { margin: .75rem 0; }
ul { padding-left: 1.25rem; }
li { margin: .35rem 0; }
a { color: #7ee7a0; }
.lede { font-size: 1.05rem; color: #c4cfdd; }
code, kbd, pre { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
code { font-size: .875em; background: #151a23; padding: .1rem .3rem; border-radius: .25rem; }
kbd { font-size: .8em; background: #151a23; border: 1px solid #253044; border-bottom-width: 2px; padding: .05rem .35rem; border-radius: .25rem; }
pre { background: #0f141d; border: 1px solid #1c2431; border-radius: .5rem; padding: .875rem 1rem; overflow-x: auto; }
pre code { background: none; padding: 0; font-size: .85rem; line-height: 1.6; }
table { border-collapse: collapse; width: 100%; font-size: .925rem; }
th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid #1c2431; vertical-align: top; }
th { color: #9aa7b8; font-weight: 600; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
details { border-top: 1px solid #1c2431; padding: .75rem 0; }
details summary { cursor: pointer; font-weight: 500; }
details p { color: #c4cfdd; margin: .5rem 0 0; }
footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #1c2431; color: #9aa7b8; font-size: .9rem; }
footer nav { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; margin-bottom: 1rem; }
`

const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>`

function render(page) {
  const url = `${SITE}/${page.slug}/`
  const others = PAGES.filter((p) => p.slug !== page.slug)

  /*
    FAQPage plus BreadcrumbList. The FAQ answers are the same text a visitor reads — marking
    up content that is not on the page is exactly what the structured-data guidelines
    prohibit, and it is also just dishonest.
  */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: page.faq.map((entry) => ({
          '@type': 'Question',
          name: entry.q,
          acceptedAnswer: { '@type': 'Answer', text: entry.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'JsonBro', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: page.h1, item: url },
        ],
      },
      {
        '@type': 'WebPage',
        url,
        name: page.title,
        description: page.description,
        isPartOf: { '@type': 'WebApplication', name: 'JsonBro', url: `${SITE}/` },
      },
    ],
  }

  return `<!doctype html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escape(page.title)}</title>
  <meta name="description" content="${escape(page.description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />

  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  <meta name="theme-color" content="#0b0f16" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${escape(page.title)}" />
  <meta property="og:description" content="${escape(page.description)}" />
  <meta property="og:image" content="${SITE}/og-image.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escape(page.title)}" />
  <meta name="twitter:description" content="${escape(page.description)}" />
  <meta name="twitter:image" content="${SITE}/og-image.jpg" />

  <!-- Same self-hosted families as the app, so the shared cache is warm either way round. -->
  <link rel="preload" href="/fonts/inter-variable.woff2" as="font" type="font/woff2" crossorigin />
  <style>
    @font-face { font-family: 'Inter'; font-style: normal; font-weight: 400 700; font-display: swap; src: url('/fonts/inter-variable.woff2') format('woff2'); }
    @font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400 600; font-display: swap; src: url('/fonts/jetbrains-mono-variable.woff2') format('woff2'); }
${CSS.split('\n').map((line) => (line ? `    ${line}` : line)).join('\n')}
  </style>

  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>
</head>

<body>
  <header>
    <a class="brand" href="/">${LOGO} JsonBro</a>
  </header>

  <main>
    <h1>${escape(page.h1)}</h1>
    <p class="lede">${page.intro}</p>
    <a class="cta" href="/?w=${page.workspace}">Open the ${page.workspace === 'editor' ? 'editor' : page.workspace} →</a>
${page.sections.map((section) => `    <h2>${escape(section.h2)}</h2>${section.html}`).join('\n')}

    <h2>Questions</h2>
${page.faq
  .map(
    (entry) => `    <details>
      <summary>${escape(entry.q)}</summary>
      <p>${escape(entry.a)}</p>
    </details>`,
  )
  .join('\n')}

    <a class="cta" href="/?w=${page.workspace}">Try it with your own JSON →</a>
  </main>

  <footer>
    <nav>
${others.map((p) => `      <a href="/${p.slug}/">${escape(p.h1)}</a>`).join('\n')}
    </nav>
    <p>
      JsonBro runs entirely in your browser — no uploads, no accounts, no tracking.
      <a href="https://github.com/sravand123/jsonbro.dev">Source on GitHub</a>.
    </p>
  </footer>
</body>

</html>
`
}

function renderSitemap() {
  const urls = [
    { loc: `${SITE}/`, priority: '1.0', changefreq: 'weekly' },
    ...PAGES.map((page) => ({
      loc: `${SITE}/${page.slug}/`,
      priority: '0.8',
      changefreq: 'monthly',
    })),
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`
}

for (const page of PAGES) {
  const dir = join(dist, page.slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'index.html'), render(page), 'utf8')
}

await writeFile(join(dist, 'sitemap.xml'), renderSitemap(), 'utf8')

console.log(
  `generated ${PAGES.length} landing pages and a sitemap with ${PAGES.length + 1} URLs (lastmod ${today})`,
)
