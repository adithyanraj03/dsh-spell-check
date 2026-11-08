/**
 * Generate the browser half's embedded engine + dictionary.
 *
 * WHY THIS EXISTS
 *
 * The client half runs in the browser and cannot read files, so to correct
 * without a round trip it needs the dictionary INSIDE its bundle. Embedding it
 * by hand would mean a second copy of the rules that drifts from src/engine.js
 * — the exact failure this avoids.
 *
 * So src/engine.js stays the single source of truth: this script strips its
 * `export` keywords into a plain script block, prepends the word list, and
 * splices both into the marked region of src/client.js. The host half imports
 * src/engine.js directly, so both halves run the SAME code.
 *
 * Run with `node scripts/build-client.mjs` (also `npm run build`).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const BEGIN = '/* >>> GENERATED ENGINE BLOCK'
const END = '/* <<< GENERATED ENGINE BLOCK <<< */'

const words = readFileSync(join(root, 'assets', 'words.txt'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)

/**
 * An OPTIONAL second word list, for swapping in a different dictionary.
 *
 * SCOWL, a Hunspell `en_US.dic`, or a wordfreq export all reduce to "one word
 * per line", so dropping a file here is enough to change the dictionary without
 * touching this plugin. It goes AFTER the shipped list, which keeps the common
 * words ahead of it in the ranking.
 */
const EXTRA = join(root, 'assets', 'words-extra.txt')
let extra = []
if (existsSync(EXTRA)) {
  extra = readFileSync(EXTRA, 'utf8')
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    // Hunspell dictionaries carry an affix marker after a slash (walk/ed) and
    // SCOWL uses a similar suffix; only the plain headword is a word here.
    .map((line) => line.split(/[/\s]/)[0])
    .filter((line) => /^[a-z][a-z'-]{1,24}$/.test(line))
  console.log(`build: extra dictionary ${extra.length} words from assets/words-extra.txt`)
}

const all = [...new Set([...words, ...extra])]

if (words.length === 0) {
  console.error('build: assets/words.txt is empty — refusing to write a bundle with no dictionary')
  process.exit(1)
}

/**
 * src/engine.js as a plain script fragment.
 *
 * Only three export shapes are used in that file, and all three are line-initial
 * by convention, so this stays a formatting rule rather than a parser.
 */
const engineSource = readFileSync(join(root, 'src', 'engine.js'), 'utf8')
  .split('\n')
  .filter((line) => !line.startsWith('export default'))
  .map((line) => (line.startsWith('export ') ? line.slice('export '.length) : line))
  .join('\n')

const block = [
  BEGIN + ' — run `npm run build`. Do not edit between the markers. >>> */',
  '',
  '    /* The ranked word list, most frequent first. Index is the frequency rank. */',
  '    const WORD_LIST = ' + JSON.stringify(all.join('\n')) + ';',
  '',
  engineSource,
  '',
  '    /* The one engine instance this page uses. */',
  '    const ENGINE = createEngine(WORD_LIST.split("\\n").filter(Boolean), TYPO_MAP);',
  '',
  '    ' + END,
].join('\n')

const clientPath = join(root, 'src', 'client.js')
const client = readFileSync(clientPath, 'utf8')

const start = client.indexOf(BEGIN)
const finish = client.indexOf(END)
if (start === -1 || finish === -1 || finish < start) {
  console.error('build: generated markers not found in src/client.js')
  process.exit(1)
}

const next = client.slice(0, start) + block + client.slice(finish + END.length)
writeFileSync(clientPath, next, 'utf8')

const bytes = Buffer.byteLength(next, 'utf8')
console.log(`build: embedded ${all.length} words into src/client.js (${(bytes / 1024).toFixed(1)} KB)`)
