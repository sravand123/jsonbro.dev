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
.brand svg { width: 1.5rem; height: 1.6rem; }
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

// The same mark the interface uses, inlined so a landing page stays one request.
const LOGO = `<svg viewBox="17.49 15.86 94.24 100.91" fill="none" aria-hidden="true"><g fill="#22c55e" stroke="#22c55e" stroke-width="3.5" stroke-linejoin="round"><path transform="translate(10.50 0)" d="M3.69318 66.4602V62.0568C7.64678 62.0568 10.4048 61.2282 11.9673 59.571C13.5535 57.9138 14.3466 55.1439 14.3466 51.2614V39.8977C14.3466 36.6307 14.6544 33.8016 15.2699 31.4105C15.9091 29.0194 16.9389 27.0426 18.3594 25.4801C19.7798 23.9176 21.6738 22.7576 24.0412 22C26.4086 21.2424 29.3324 20.8636 32.8125 20.8636V27.8239C30.0663 27.8239 27.9001 28.25 26.3139 29.1023C24.7514 29.9545 23.6387 31.2803 22.9759 33.0795C22.3366 34.8551 22.017 37.1278 22.017 39.8977V54.1023C22.017 55.9489 21.7685 57.6297 21.2713 59.1449C20.7978 60.66 19.91 61.9621 18.608 63.0511C17.3059 64.1402 15.4474 64.9806 13.0327 65.5724C10.6416 66.1643 7.52841 66.4602 3.69318 66.4602ZM32.8125 111.773C29.3324 111.773 26.4086 111.394 24.0412 110.636C21.6738 109.879 19.7798 108.719 18.3594 107.156C16.9389 105.594 15.9091 103.617 15.2699 101.226C14.6544 98.8348 14.3466 96.0057 14.3466 92.7386V81.375C14.3466 77.4924 13.5535 74.7225 11.9673 73.0653C10.4048 71.4081 7.64678 70.5795 3.69318 70.5795V66.1761C7.52841 66.1761 10.6416 66.4721 13.0327 67.0639C15.4474 67.6558 17.3059 68.4962 18.608 69.5852C19.91 70.6742 20.7978 71.9763 21.2713 73.4915C21.7685 75.0066 22.017 76.6875 22.017 78.5341V92.7386C22.017 95.5085 22.3366 97.7813 22.9759 99.5568C23.6387 101.332 24.7514 102.646 26.3139 103.499C27.9001 104.375 30.0663 104.812 32.8125 104.812V111.773ZM3.69318 70.5795V62.0568H12.0739V70.5795H3.69318Z"/><path transform="translate(-10.50 0)" d="M125.528 66.1761V70.5795C121.575 70.5795 118.805 71.4081 117.219 73.0653C115.656 74.7225 114.875 77.4924 114.875 81.375V92.7386C114.875 96.0057 114.555 98.8348 113.916 101.226C113.301 103.617 112.283 105.594 110.862 107.156C109.442 108.719 107.548 109.879 105.18 110.636C102.813 111.394 99.8892 111.773 96.4091 111.773V104.812C99.1553 104.812 101.31 104.375 102.872 103.499C104.458 102.646 105.571 101.332 106.21 99.5568C106.873 97.7813 107.205 95.5085 107.205 92.7386V78.5341C107.205 76.6875 107.441 75.0066 107.915 73.4915C108.412 71.9763 109.312 70.6742 110.614 69.5852C111.916 68.4962 113.762 67.6558 116.153 67.0639C118.568 66.4721 121.693 66.1761 125.528 66.1761ZM96.4091 20.8636C99.8892 20.8636 102.813 21.2424 105.18 22C107.548 22.7576 109.442 23.9176 110.862 25.4801C112.283 27.0426 113.301 29.0194 113.916 31.4105C114.555 33.8016 114.875 36.6307 114.875 39.8977V51.2614C114.875 55.1439 115.656 57.9138 117.219 59.571C118.805 61.2282 121.575 62.0568 125.528 62.0568V66.4602C121.693 66.4602 118.568 66.1643 116.153 65.5724C113.762 64.9806 111.916 64.1402 110.614 63.0511C109.312 61.9621 108.412 60.66 107.915 59.1449C107.441 57.6297 107.205 55.9489 107.205 54.1023V39.8977C107.205 37.1278 106.873 34.8551 106.21 33.0795C105.571 31.2803 104.458 29.9545 102.872 29.1023C101.31 28.25 99.1553 27.8239 96.4091 27.8239V20.8636ZM125.528 62.0568V70.5795H117.148V62.0568H125.528Z"/></g><path fill="#f6a823" transform="translate(54.55 32.68) scale(0.6287) translate(-49 -15)" d="M58.8461 15L49.3517 67.5153H59.9011L49 122L77.8353 57.6687H67.6374L81 15H58.8461Z"/></svg>`

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
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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
