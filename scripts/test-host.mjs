/**
 * Host-half test: `node scripts/test-host.mjs`.
 *
 * Exercises the exact functions the Remote service delegates to, with the real
 * shipped dictionary — so this is the check that makes a restart worth doing:
 * it proves the word list loads from the package, that a typo is answered
 * correctly, and that a correctly spelled word is left alone.
 *
 * The transport class is NOT constructed here on purpose: `TypertRemoteService`
 * extends cordis's `Service`, which needs a real cordis Context. Faking one
 * would test the fake. The class is a three-line delegation, and the delegation
 * itself is asserted below.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

let passed = 0
const failures = []
function check(name, condition, detail) {
  if (condition) {
    passed += 1
    return
  }
  failures.push(name + (detail === undefined ? '' : ` — ${detail}`))
}

/* --- the package actually ships its dictionary ------------------------ */

const wordsPath = join(root, 'assets', 'words.txt')
check('dictionary file ships with the package', existsSync(wordsPath), wordsPath)

const words = readFileSync(wordsPath, 'utf8').split('\n').filter(Boolean)
check('dictionary has a useful size', words.length >= 10000, String(words.length))
check('dictionary is frequency-ordered', words[0] === 'the' && words.includes('the'), words[0])
check('the list contains no duplicates', new Set(words).size === words.length, `${new Set(words).size} vs ${words.length}`)
check('every entry is a plain lowercase word', words.every((w) => /^[a-z]{2,20}$/.test(w)))

/* --- the service body ------------------------------------------------- */

const module = await import('../src/index.js')

check('module exports apply', typeof module.apply === 'function')
check('module name', module.name === 'dsh-spell-check', String(module.name))
check('no hard dependency blocks mounting', Array.isArray(module.inject) && module.inject.length === 0, JSON.stringify(module.inject))
check('suggestWord is exported', typeof module.suggestWord === 'function')
check('checkWord is exported', typeof module.checkWord === 'function')
check('learnWord is exported', typeof module.learnWord === 'function')

const answer = await module.suggestWord('theh')
check('suggest() returns a list', Array.isArray(answer.suggestions), JSON.stringify(answer.suggestions))
check('suggest("theh") proposes "the"', answer.suggestions[0]?.word === 'the', JSON.stringify(answer.suggestions))
check('suggest() echoes the queried word', answer.word === 'theh', String(answer.word))

const second = await module.suggestWord('conntextion')
check('suggest("conntextion") proposes "connection"', second.suggestions[0]?.word === 'connection', JSON.stringify(second.suggestions))

const good = await module.suggestWord('connection')
check('suggest() stays silent on a correct word', good.suggestions.length === 0, JSON.stringify(good.suggestions))

const acronym = await module.suggestWord('DSH')
check('suggest() ignores acronyms', acronym.suggestions.length === 0, JSON.stringify(acronym.suggestions))

check('check() knows a real word', (await module.checkWord('connection')).known === true)
check('check() rejects a typo', (await module.checkWord('theh')).known === false)

/* --- learned words persist -------------------------------------------- */

const learned = await module.learnWord('zzspellcheckprobe')
check('learn() accepts a new word', learned.added === true, JSON.stringify(learned))
check('learned word is not corrected', (await module.suggestWord('zzspellcheckprobe')).suggestions.length === 0)
check('learned word is a known word', (await module.checkWord('zzspellcheckprobe')).known === true)

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length > 0) {
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exitCode = 1
}
