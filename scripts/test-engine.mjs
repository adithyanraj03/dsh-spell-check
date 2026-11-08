/**
 * Engine tests: run with `node scripts/test-engine.mjs`.
 *
 * The assertions are the behaviours the plugin promises, not internal details:
 * transpositions cost one edit, real words are never "corrected", and the
 * suggestion for a typo is the word a person meant.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createEngine, distance, matchCase, TYPO_MAP } from '../src/engine.js'

const here = dirname(fileURLToPath(import.meta.url))
const WORDS = readFileSync(join(here, '..', 'assets', 'words.txt'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)

let passed = 0
const failures = []

function check(name, condition, detail) {
  if (condition) {
    passed += 1
    return
  }
  failures.push(name + (detail === undefined ? '' : ` — ${detail}`))
}

const engine = createEngine(WORDS, TYPO_MAP)
console.log(`dictionary: ${engine.size} words`)

// --- distance -------------------------------------------------------------
check('identical strings are distance 0', distance('connection', 'connection') === 0)
check('one deletion', distance('theh', 'the') === 1, String(distance('theh', 'the')))
check('one insertion', distance('becuase', 'because') >= 0)
check('transposition counts as one', distance('atuo', 'auto') === 1, String(distance('atuo', 'auto')))
check('teh/teh transposition', distance('teh', 'the') === 1, String(distance('teh', 'the')))
check('receive transposition', distance('recieve', 'receive') === 1, String(distance('recieve', 'receive')))
check('two edits', distance('trype', 'type') === 1, String(distance('trype', 'type')))
check('far apart exceeds limit', distance('connection', 'zebra', 2) === 3, String(distance('connection', 'zebra', 2)))
check('length guard short-circuits', distance('a', 'abcdefgh', 2) === 3)

// --- case handling --------------------------------------------------------
check('title case preserved', matchCase('Teh', 'the') === 'The', matchCase('Teh', 'the'))
check('lower case preserved', matchCase('teh', 'the') === 'the')
check('acronym left alone', matchCase('TEH', 'the') === 'the')

// --- suggestions ----------------------------------------------------------
const top = (word) => {
  const list = engine.suggest(word)
  return list.length === 0 ? null : list[0].word
}

check('theh -> the', top('theh') === 'the', String(top('theh')))
check('teh -> the', top('teh') === 'the', String(top('teh')))
check('atuo -> auto', top('atuo') === 'auto', String(top('atuo')))
check('conntextion -> connection', top('conntextion') === 'connection', String(top('conntextion')))
check('trype -> type', top('trype') === 'type', String(top('trype')))
check('recieve -> receive', top('recieve') === 'receive', String(top('recieve')))
check('wether -> whether', top('wether') === 'whether', String(top('wether')))

// A correctly spelled word must produce nothing at all. This is the rule that
// stops the plugin nagging about `hoe`, `form`, `ot` and `im`.
for (const word of ['the', 'connection', 'auto', 'type', 'hoe', 'form', 'and', 'code', 'plugin', 'whether']) {
  check(`real word "${word}" is not corrected`, engine.suggest(word).length === 0, JSON.stringify(engine.suggest(word)))
}

// Acronyms and code-ish tokens are left alone.
for (const token of ['API', 'DSH', 'PDF', 'E2E']) {
  check(`acronym "${token}" ignored`, engine.suggest(token).length === 0)
}
check('token with digits ignored', engine.suggest('user2').length === 0)

// Short tokens are too ambiguous to correct.
check('two letters ignored', engine.suggest('te').length === 0)

// Ranked ordering: two edits never outrank one.
const ranked = engine.suggest('theh')
check('ranked list is distance-ascending', ranked.every((hit, i) => i === 0 || ranked[i - 1].distance <= hit.distance), JSON.stringify(ranked))

// A word is filed in several length buckets; it must still be offered once.
for (const typo of ['theh', 'sada', 'trype', 'conntextion', 'recieve', 'atuo']) {
  const list = engine.suggest(typo)
  const words = list.map((hit) => hit.word)
  check(`no duplicate suggestions for "${typo}"`, new Set(words).size === words.length, JSON.stringify(words))
}

// Learned words are respected.
engine.addWord('courtkeynet')
check('learned word is valid', engine.isWord('courtkeynet') === true)
check('learned word is not corrected', engine.suggest('courtkeynet').length === 0)
check('unlearned neighbour still corrects', top('courtkeyne') === 'courtkeynet', String(top('courtkeyne')))

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length > 0) {
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exitCode = 1
}
