/**
 * Content for the static landing pages.
 *
 * The app itself is client-rendered, so its HTML carries almost no text: good for a tool,
 * useless for anyone searching for one. These pages ship real prose in the initial
 * response, then link into the workspace that does the job.
 *
 * Every claim here has to match what the app actually does. Landing pages that promise
 * more than the product delivers are worse than no landing pages, and pages that differ
 * only by keyword get treated as doorways. Where the honest answer is a limitation, say so
 * — "nested values are stringified, not expanded" is more useful than silence.
 */

export const SITE = 'https://jsonbro.dev'

/** @typedef {{ q: string, a: string }} Faq */

export const PAGES = [
  {
    slug: 'json-formatter',
    workspace: 'editor',
    title: 'JSON Formatter — beautify JSON without losing precision',
    description:
      'Format and beautify JSON in your browser. Keeps large integers and high-precision decimals exact, unlike formatters that round-trip through JavaScript numbers.',
    h1: 'JSON formatter and beautifier',
    intro:
      'Paste JSON, press <kbd>⌘⇧F</kbd>, and read it. Formatting happens in your browser — the document is never uploaded — and it will not quietly change your numbers.',
    sections: [
      {
        h2: 'Most formatters corrupt large numbers',
        html: `
<p>The usual way to format JSON is <code>JSON.stringify(JSON.parse(text), null, 2)</code>.
That parses every number into a JavaScript double, and doubles cannot represent integers
beyond 2<sup>53</sup>. Feed a snowflake ID or a database bigint through such a formatter and
it comes back wrong:</p>
<pre><code>{ "id": 12345678901234567890 }   // before formatting
{ "id": 12345678901234567000 }   // after a stringify/parse formatter</code></pre>
<p>Those last three digits are gone, silently, in data that still looks plausible. JsonBro
formats by editing the concrete syntax tree instead: whitespace between tokens changes, and
the tokens themselves are copied through untouched. The same protection applies to
high-precision decimals and exponent notation.</p>`,
      },
      {
        h2: 'What formatting does',
        html: `
<ul>
  <li><strong>Indent</strong> with 2 or 4 spaces, or tabs — your choice, remembered between visits.</li>
  <li><strong>Minify</strong> to a single line when you need the smallest payload (<kbd>⌘⌥M</kbd>).</li>
  <li><strong>Sort keys</strong> alphabetically, at every level, without reordering array items (<kbd>⌘⌥S</kbd>).</li>
  <li><strong>Format on paste</strong>, if you would rather not press anything.</li>
</ul>
<p>All three transforms preserve the exact text of every value. Sorting keys on a document
with duplicate keys keeps both, and flags them, rather than dropping one.</p>`,
      },
      {
        h2: 'When the document will not format',
        html: `
<p>Formatting needs a parseable document. If yours is invalid, the editor explains the
problem in plain language, points at the line, and offers a one-click repair for the common
causes: trailing commas, single-quoted strings, unquoted keys, comments and smart quotes
pasted from a document editor. See the <a href="/json-validator/">JSON validator</a> for
what each message means.</p>`,
      },
    ],
    faq: [
      {
        q: 'Does formatting change my data?',
        a: 'No. Only whitespace between tokens changes. Numbers, strings and key order are preserved byte-for-byte, including integers too large for JavaScript to represent exactly.',
      },
      {
        q: 'Is my JSON uploaded anywhere?',
        a: 'No. Parsing and formatting run in your browser. There is no backend to send data to, and no analytics.',
      },
      {
        q: 'How large a document can it format?',
        a: 'Documents of a few megabytes format comfortably. Past 3 MB some conveniences switch off to keep typing responsive, and the automatic-repair check is skipped above 2 MB.',
      },
      {
        q: 'Can I format JSON with comments or trailing commas?',
        a: 'Yes — repair those first. The editor detects comments, trailing commas, single quotes and unquoted keys and can strip or correct them in one action, after which the document formats normally.',
      },
    ],
  },

  {
    slug: 'json-validator',
    workspace: 'editor',
    title: 'JSON Validator — errors explained in plain language',
    description:
      'Validate JSON in your browser and get an explanation instead of a byte offset: the line, the likely cause, duplicate keys, and one-click repair.',
    h1: 'JSON validator with readable errors',
    intro:
      'Most validators tell you <code>Unexpected token } in JSON at position 1247</code>. That is the parser\'s point of view, not yours. This one translates the error, attaches it to a line, and suggests the fix.',
    sections: [
      {
        h2: 'What the messages actually say',
        html: `
<p>The parse error is diagnosed before it is reported, so the message describes the cause
rather than the symptom:</p>
<table>
  <thead><tr><th>What is wrong</th><th>What you are told</th></tr></thead>
  <tbody>
    <tr><td><code>["a" "b"]</code></td><td>Missing comma between array items, or an unclosed <code>]</code></td></tr>
    <tr><td><code>{'a': 1}</code></td><td>Strings and keys must use double quotes</td></tr>
    <tr><td><code>{a: 1}</code></td><td>Object keys must be quoted</td></tr>
    <tr><td><code>{"a": 1,}</code></td><td>Trailing comma before the closing brace</td></tr>
    <tr><td>A document cut short</td><td>The document ends before it is complete</td></tr>
  </tbody>
</table>
<p>The report waits for a pause in your typing before appearing, because a document is
invalid for most of the time you are editing it and a banner reacting to every keystroke is
noise. It shows as a small chip naming the line; hovering it reveals the explanation and the
repair action.</p>`,
      },
      {
        h2: 'Duplicate keys: valid JSON that loses data',
        html: `
<p><code>{"a": 1, "a": 2}</code> parses successfully in every JSON implementation, and one of
those values disappears. Because the document is technically valid, most validators say
nothing at all. This one flags duplicate keys explicitly, naming them, so you find out
before the missing field becomes a bug somewhere else.</p>`,
      },
      {
        h2: 'Automatic repair',
        html: `
<p>When the problem is mechanical, repair is offered inline: trailing commas, single quotes,
unquoted keys, comments, and the curly quotes that arrive when JSON has been through a word
processor or chat client. Repair rewrites only what it must, and you can undo it. Above 2 MB
the repair check is skipped rather than allowed to block the editor, and the report says so
instead of pretending.</p>`,
      },
    ],
    faq: [
      {
        q: 'What does "Unexpected token" actually mean?',
        a: 'It means the parser found a character that cannot appear where it appeared — most often a missing comma, an extra comma, an unquoted key, or a quote that was never closed. This validator names the specific cause instead of reporting the raw token.',
      },
      {
        q: 'Is JSON with comments valid?',
        a: 'No. JSON has no comment syntax, so // and /* */ make a document invalid — even though many tools accept them. Repair can strip comments so the result validates.',
      },
      {
        q: 'Are duplicate keys allowed in JSON?',
        a: 'The specification permits them but says the behaviour is undefined; in practice parsers keep the last one and discard the rest, silently losing data. This validator flags them.',
      },
      {
        q: 'Does validation happen on a server?',
        a: 'No. Validation runs in a Web Worker inside your browser, so large documents do not freeze the interface and nothing is transmitted.',
      },
    ],
  },

  {
    slug: 'json-diff',
    workspace: 'compare',
    title: 'JSON Diff — compare two JSON documents side by side',
    description:
      'Compare two JSON documents in your browser. Side-by-side or unified diff, with options to ignore key order and whitespace so only real differences show.',
    h1: 'JSON diff and compare',
    intro:
      'Put one document on the left, the other on the right, and see what changed. Both panes are editable and independently validated, so you can fix a document while comparing it.',
    sections: [
      {
        h2: 'Ignore the differences you do not care about',
        html: `
<ul>
  <li><strong>Ignore key order.</strong> Two objects with the same entries in a different
  order are the same object as far as JSON semantics go, but a text diff will paint them
  entirely red and green. With this on, only genuine changes are highlighted.</li>
  <li><strong>Ignore whitespace.</strong> Compare a minified response against a formatted
  fixture without every line registering as a change.</li>
</ul>
<p>Both are toggles, so you can see either view without re-pasting anything.</p>`,
      },
      {
        h2: 'Two layouts, one keystroke apart',
        html: `
<p><strong>Split</strong> shows the documents beside each other with changes aligned;
<strong>unified</strong> stacks them as a single stream of additions and deletions, which is
easier to scan on a narrow screen. <kbd>⌘⌥D</kbd> switches between editing the panes and
viewing the diff, and your caret position survives the switch.</p>`,
      },
      {
        h2: 'Getting the documents in',
        html: `
<p>Paste, drop a file onto either pane, or send the document you already have open in the
editor to whichever side you want — useful for comparing a response you are inspecting
against a known-good fixture. Each pane remembers its content between visits.</p>`,
      },
    ],
    faq: [
      {
        q: 'Can it compare JSON regardless of key order?',
        a: 'Yes. Turn on "ignore key order" and objects whose keys appear in a different sequence are treated as identical, leaving only real differences highlighted.',
      },
      {
        q: 'Does it do a semantic or a textual diff?',
        a: 'Textual, computed after optional normalisation for key order and whitespace. That keeps the output aligned with the text you are editing rather than an abstract tree you cannot see.',
      },
      {
        q: 'Are both documents uploaded for comparison?',
        a: 'No. The diff is computed in your browser. Neither document leaves your machine.',
      },
      {
        q: 'Can I edit while comparing?',
        a: 'Yes. Both panes are full editors with their own validation, and typing in the read-only diff view returns you to edit mode automatically.',
      },
    ],
  },

  {
    slug: 'jsonpath-tester',
    workspace: 'query',
    title: 'JSONPath Tester — evaluate JSONPath expressions live',
    description:
      'Test JSONPath expressions against your own JSON, evaluated as you type. Filters, slices and recursive descent, with the grammar documented.',
    h1: 'JSONPath tester and evaluator',
    intro:
      'Type an expression, see the matches immediately, each labelled with its full path. No run button, no server round-trip, and the grammar is documented rather than guessed at.',
    sections: [
      {
        h2: 'Supported syntax',
        html: `
<p>A practical subset rather than the full specification — this is the complete list, and the
same table is available inside the app:</p>
<table>
  <thead><tr><th>Syntax</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td><code>$</code></td><td>the whole document</td></tr>
    <tr><td><code>.key</code></td><td>a property; use <code>['odd key']</code> when it contains spaces or dashes</td></tr>
    <tr><td><code>[0]</code></td><td>an array item; <code>[-1]</code> counts back from the end</td></tr>
    <tr><td><code>[1:4]</code></td><td>a slice; <code>[:2]</code> and <code>[2:]</code> also work</td></tr>
    <tr><td><code>.*</code> or <code>[*]</code></td><td>every child of an object or array</td></tr>
    <tr><td><code>..key</code></td><td>that property at any depth</td></tr>
    <tr><td><code>$..[?(…)]</code></td><td>any node anywhere matching the test</td></tr>
    <tr><td><code>$.list[?(…)]</code></td><td>the members of <code>list</code> matching the test</td></tr>
    <tr><td><code>@.field</code></td><td>a field of the node being tested</td></tr>
    <tr><td><code>== != &gt; &gt;= &lt; &lt;=</code></td><td>comparisons against a number, string, <code>true</code>/<code>false</code> or <code>null</code></td></tr>
    <tr><td><code>=~ "re"</code></td><td>regular-expression match on a string</td></tr>
    <tr><td><code>[?(@.flag)]</code></td><td>nodes where the field is truthy</td></tr>
  </tbody>
</table>`,
      },
      {
        h2: 'Worked examples',
        html: `
<pre><code>$..id                      // every id, however deeply nested
$.items[0:3]               // the first three items
$..[?(@.active == true)]   // every active node anywhere
$..[?(@.name =~ "^ab")]    // names starting with "ab"
$.users[-1].email          // the last user's email</code></pre>
<p>Recursive descent is descendant-<em>or-self</em>, so <code>$..[?(…)]</code> tests the root
as well as everything under it, and overlapping routes to the same node are reported once.</p>`,
      },
      {
        h2: 'Not supported',
        html: `
<p>Script expressions, unions of distinct paths (<code>$['a','b']</code>), parent navigation,
and functions such as <code>length()</code>. If an expression is invalid you get a message
saying why, not an empty result list that looks like "no matches".</p>`,
      },
    ],
    faq: [
      {
        q: 'What is JSONPath?',
        a: 'A query language for JSON, roughly what XPath is for XML. $ is the document root, dots and brackets walk into properties and array items, .. searches at any depth, and [?(…)] filters by a test.',
      },
      {
        q: 'How do I filter an array by a field value?',
        a: 'Use a filter expression: $.users[?(@.active == true)] returns the members of users whose active field is true. @ refers to the item being tested.',
      },
      {
        q: 'Why does my expression return nothing?',
        a: 'Usually a name that does not exist at that level, or a filter compared against the wrong type. Try the same path without the filter first, then add the test back — matches update as you type, so it is quick to narrow down.',
      },
      {
        q: 'Is the query run on a server?',
        a: 'No. Expressions are evaluated in a Web Worker in your browser, against the document you have open.',
      },
    ],
  },

  {
    slug: 'json-to-csv',
    workspace: 'editor',
    title: 'JSON to CSV — convert in your browser',
    description:
      'Convert JSON to CSV and CSV to JSON without uploading anything. Arrays of objects become rows and columns; a single object becomes one row.',
    h1: 'JSON to CSV converter',
    intro:
      'Open a JSON document, choose CSV when you save, and you have a spreadsheet-ready file. It works in the other direction too: drop a CSV in and get JSON.',
    sections: [
      {
        h2: 'How the conversion maps',
        html: `
<p>An array of objects is the natural shape: each object becomes a row, each distinct key
becomes a column. A single object is treated as a one-row table. Column order follows the
keys as they appear.</p>
<pre><code>[{ "id": 1, "name": "ada" }, { "id": 2, "name": "grace" }]

id,name
1,ada
2,grace</code></pre>`,
      },
      {
        h2: 'What it does not do',
        html: `
<p><strong>Nested values are not flattened into columns.</strong> An object or array inside a
field is written into the cell as text rather than expanded into <code>address.city</code>
style headers. If you need flat output, reshape the document first — the
<a href="/jsonpath-tester/">JSONPath</a> panel is a quick way to pull out the array you
actually want, and the <a href="/json-viewer/">tree view</a> makes the shape obvious.</p>`,
      },
      {
        h2: 'CSV to JSON',
        html: `
<p>Import a <code>.csv</code> file by picker or drag-and-drop and it is parsed into an array
of objects keyed by the header row, then formatted so you can read it. From there everything
else applies: validate it, query it, diff it against another file, or save it back out as
JSON.</p>`,
      },
    ],
    faq: [
      {
        q: 'Does the converter handle nested JSON?',
        a: 'It accepts it, but nested objects and arrays are written into a single cell as text rather than expanded into separate columns. Flatten or extract the array you need first if you want one column per field.',
      },
      {
        q: 'Can I convert CSV back to JSON?',
        a: 'Yes. Import a CSV file and it becomes an array of objects using the header row as keys.',
      },
      {
        q: 'Is my file uploaded to convert it?',
        a: 'No. Both directions run in your browser, and the download is generated locally.',
      },
      {
        q: 'What happens to empty or missing fields?',
        a: 'Rows are written with a column for every key seen in the document; where an object lacks that key the cell is empty.',
      },
    ],
  },

  {
    slug: 'json-viewer',
    workspace: 'tree',
    title: 'JSON Viewer — browse large JSON as a tree',
    description:
      'View and explore JSON as a collapsible tree in your browser. Handles large documents, shows the path of every node, and lets you edit values in place.',
    h1: 'JSON viewer and tree browser',
    intro:
      'Text is a poor way to understand an unfamiliar payload. The tree view shows structure first: expand what interests you, collapse what does not, and read the path of anything you land on.',
    sections: [
      {
        h2: 'Built for documents that are too big to read',
        html: `
<p>Rows are virtualised, so only what is on screen is rendered and a document with tens of
thousands of nodes scrolls smoothly. Expand-all is budgeted rather than optimistic: it
expands as much as it can — up to 15,000 containers — and tells you what it did instead of
freezing while it tries to open everything.</p>`,
      },
      {
        h2: 'Every node knows where it is',
        html: `
<p>Each row shows its key, a type-coloured value, and for containers the number of children.
Selecting a row puts its full JSON path in the status bar, one click from your clipboard, and
you can jump from a tree node straight to the matching line in the editor. Hovering a value
in the editor works the other way round, showing the path without leaving the text.</p>`,
      },
      {
        h2: 'Editing without reformatting the file',
        html: `
<p>Values can be edited, keys added and nodes deleted directly in the tree, and the edit is
applied to the document text rather than to a parsed copy — so the formatting of every line
you did not touch is preserved, along with the exact text of numbers. Adding a value shows
you how it will be stored (as a string, a number, a boolean or null) before you commit it.</p>`,
      },
    ],
    faq: [
      {
        q: 'Can it open large JSON files?',
        a: 'Yes. The tree is virtualised so rendering cost does not grow with document size, and analysis runs off the main thread. Multi-megabyte documents are usable; expand-all is capped at 15,000 containers and reports when it stops.',
      },
      {
        q: 'Can I edit values in the tree?',
        a: 'Yes — edit a value, add a key or delete a node. Changes are written into the document text, leaving untouched lines formatted exactly as they were.',
      },
      {
        q: 'How do I get the path to a nested field?',
        a: 'Select the row: its full path appears in the status bar and can be copied in one click. Hovering the value in the editor shows the same path.',
      },
      {
        q: 'Does viewing a file upload it?',
        a: 'No. Files you open stay in your browser; the app has no backend.',
      },
    ],
  },
]
