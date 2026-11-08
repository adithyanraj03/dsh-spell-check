/**
 * dsh-spell-check — the host half.
 *
 * Owns ONE correction engine (src/engine.js) and answers the composer's
 * questions from it. The browser half holds no word list and no matching code:
 * it asks this service for the suggestions to draw, so the two halves cannot
 * disagree about what a word means.
 *
 * WHY THE DICTIONARY IS NOT IN THE BROWSER
 *
 * The list comes from a corpus (20k frequency-ranked English words, built from
 * the local nltk corpora — see assets/words.txt). Shipping it inside the client
 * bundle would mean re-sending ~160 KB on every page load AND a second copy of
 * the matching rules to keep in sync. Read once here, cached for the life of
 * the process, and asked over the existing remote bridge.
 *
 * WHAT IT NEVER DOES
 *
 * No network requests, no telemetry, no LLM. Everything is a local array and a
 * bounded edit-distance scan.
 *
 * @module dsh-spell-check
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createEngine, TYPO_MAP } from './engine.js'

export const name = 'dsh-spell-check'

/**
 * Nothing is required to mount. The service is answered from files this package
 * ships, so a missing registry can never take the plugin down with it.
 */
export const inject = []

const here = dirname(fileURLToPath(import.meta.url))

/** The ranked word list, shipped with the package. */
const WORDS_PATH = join(here, '..', 'assets', 'words.txt')

/**
 * Words the user has taught the plugin, keyed by nothing but themselves.
 *
 * Kept next to dsh's own storages rather than in the package, so an upgrade
 * (which replaces the package directory) cannot throw away their corrections.
 */
const STORAGE_PATH = join(
  process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh'),
  'storages',
  'spell-check.json',
)

/** The engine is built once and reused for the process lifetime. */
let enginePromise

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    // Missing or half-written. Both mean "nothing stored yet".
    return undefined
  }
}

/**
 * Load the word list, the user's own words, and build the engine.
 *
 * Concurrent callers share one promise: the first keystroke after a restart
 * must not read a 160 KB file several times over.
 */
function getEngine() {
  if (enginePromise === undefined) {
    enginePromise = (async () => {
      let words = []
      try {
        const raw = await readFile(WORDS_PATH, 'utf8')
        words = raw.split('\n').map((line) => line.trim()).filter(Boolean)
      } catch {
        // No word list: the typo map alone still gives the useful behaviour.
        words = []
      }
      const engine = createEngine(words, TYPO_MAP)
      const stored = await readJson(STORAGE_PATH)
      const learned = Array.isArray(stored?.words) ? stored.words : []
      for (const word of learned) engine.addWord(word)
      return engine
    })()
  }
  return enginePromise
}

/** Write the learned words back, atomically. */
async function saveLearned(engine) {
  try {
    await mkdir(dirname(STORAGE_PATH), { recursive: true })
    const temporary = `${STORAGE_PATH}.${process.pid}.tmp`
    const body = { version: 1, words: engine.learned() }
    await writeFile(temporary, JSON.stringify(body, null, 2), 'utf8')
    await rename(temporary, STORAGE_PATH)
  } catch {
    // A lost dictionary entry is a nuisance, never worth breaking a keystroke.
  }
}

/* ------------------------------------------------------------------ *
 * The service body, as plain functions.
 *
 * Split out from the Remote class on purpose: these are the unit under test
 * (`scripts/test-host.mjs`), and they must not need a cordis Context to run.
 * The class below is the transport, not the logic.
 * ------------------------------------------------------------------ */

/** Ranked corrections for one typed token. */
export async function suggestWord(word) {
  const engine = await getEngine()
  return { word: String(word ?? ''), suggestions: engine.suggest(word) }
}

/** Whether a token is a word we know. */
export async function checkWord(word) {
  const engine = await getEngine()
  const lower = String(word ?? '').toLowerCase()
  return { word: lower, known: engine.isWord(lower) }
}

/** Teach the dictionary a word, and persist it. */
export async function learnWord(word) {
  const engine = await getEngine()
  const added = engine.addWord(word)
  if (added) await saveLearned(engine)
  return { word: String(word ?? '').toLowerCase(), added }
}

/**
 * The Remote service, built on a DYNAMIC import.
 *
 * `@deepseek-ai/dsh-typert-protocol` is provided by the host, not vendored here,
 * so importing it at module scope makes the whole file unloadable anywhere the
 * host's packages are not on the resolution path — including a clean `git clone`
 * running `npm test`, which is exactly how a broken tarball ships unnoticed.
 *
 * The browser half already does every suggestion locally, so a host without the
 * protocol package loses only the learned-word persistence. Failing softly is
 * the right trade: a plugin that still corrects, rather than one that does not
 * load at all.
 */
async function mountRemoteService(ctx) {
  let protocol
  try {
    protocol = await import('@deepseek-ai/dsh-typert-protocol')
  } catch {
    ctx.logger?.warn?.('dsh-spell-check: host protocol unavailable; learned words will not persist')
    return
  }

  const { Remote, TypertRemoteService } = protocol

  class SpellCheckRemote extends TypertRemoteService {
    constructor(ownerCtx) {
      super(ownerCtx, 'spellCheck')
    }

    /**
     * Ranked corrections for one typed token.
     *
     * Answers `{ suggestions: [] }` for a correctly spelled word — that is the
     * common case, and it is what stops the popup nagging about real words.
     */
    suggest(word) {
      return suggestWord(word)
    }

    /** Whether a token is a word we know, so the caller can skip the round trip. */
    check(word) {
      return checkWord(word)
    }

    /** Teach the dictionary a word. Persisted under dsh's storages directory. */
    learn(word) {
      return learnWord(word)
    }
  }

  /** Emulate the @Remote decorator without decorator syntax. */
  const markRemoteMethod = (prototype, method) => {
    Remote(method)(prototype[method], {
      kind: 'method',
      name: method,
      static: false,
      private: false,
      access: {
        has() {
          return false
        },
        get() {
          return undefined
        },
      },
      addInitializer(fn) {
        fn.call(Object.create(prototype))
      },
    })
  }

  for (const method of ['suggest', 'check', 'learn']) markRemoteMethod(SpellCheckRemote.prototype, method)

  return new SpellCheckRemote(ctx)
}

export function apply(ctx) {
  void mountRemoteService(ctx).catch(() => {})
  // Warm the engine while the session starts, so the first keystroke is not
  // waiting on a 160 KB read.
  void getEngine().catch(() => {})
  ctx.logger?.info?.('dsh-spell-check: ready')
}

export default { apply, inject, name }
