/**
 * Client-half test: `node scripts/test-client.mjs`.
 *
 * Loads src/client.js the way dsh does — through `window.__ModuleLoader__` —
 * with a stubbed React and DOM, then drives it against a fake context.
 *
 * It asserts the three things that were actually broken or missing:
 *   1. the module loads and registers (the ESM `preact` version did not),
 *   2. the EMBEDDED dictionary corrects without any host half,
 *   3. the controller publishes a suggestion, so the chip and Tab have
 *      something to accept.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

let passed = 0
const failures = []
function check(name, condition, detail) {
  if (condition) {
    passed += 1
    return
  }
  failures.push(name + (detail === undefined ? '' : ` — ${detail}`))
}

/* --- stub DOM --------------------------------------------------------- */

const listeners = []
const styles = []

const fakeElement = (tag) => {
  const node = {
    tagName: tag,
    className: '',
    style: {},
    children: [],
    classList: { add() {}, remove() {}, contains: () => false },
    attributes: {},
    parentNode: null,
    firstChild: null,
    offsetWidth: 120,
    textContent: '',
    appendChild(child) {
      this.children.push(child)
      child.parentNode = this
      this.firstChild = this.children[0]
      return child
    },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child)
      child.parentNode = null
      this.firstChild = this.children[0] ?? null
      return child
    },
    setAttribute(key, value) {
      this.attributes[key] = value
    },
    getAttribute(key) {
      return this.attributes[key] ?? null
    },
    // The underliner draws on a canvas; record the calls so a test can prove a
    // repaint happened (the stale-underline bug was a repaint that never ran).
    getContext() {
      if (!this.__ctx) {
        this.__draws = { clear: 0, stroke: 0 }
        const draws = this.__draws
        this.__ctx = {
          setTransform() {},
          clearRect() {
            draws.clear += 1
          },
          beginPath() {},
          moveTo() {},
          quadraticCurveTo() {},
          stroke() {
            draws.stroke += 1
          },
          strokeStyle: '',
          lineWidth: 0,
          lineCap: '',
        }
      }
      return this.__ctx
    },
    addEventListener() {},
    removeEventListener() {},
    contains() {
      return true
    },
    remove() {
      this.parentNode = null
    },
    dispatchEvent() {
      return true
    },
    closest() {
      return null
    },
  }
  return node
}

globalThis.Node = class Node {}
globalThis.NodeFilter = { SHOW_TEXT: 4 }
globalThis.Element = class Element {
  closest() {
    return null
  }
}

// Observers the underliner uses to repaint when the DOM changes without a
// keyboard event. The stubs capture the callback so a test can fire it by hand.
const createdCanvases = []
let queryResult = null
let mutationCallback = null
const intervals = []
// Controllable selection + lead text so a test can place the caret in an
// @mention / /command and prove the token (and therefore the strip) is suppressed.
let selectionStub = null
let leadText = ''
globalThis.MutationObserver = class {
  constructor(callback) {
    mutationCallback = callback
  }
  observe() {}
  disconnect() {
    mutationCallback = null
  }
}
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
}

globalThis.document = {
  head: { appendChild: (node) => styles.push(node) },
  body: { appendChild: (node) => { node.parentNode = { body: true } } },
  createElement: (tag) => {
    const node = fakeElement(tag)
    if (tag === 'canvas') createdCanvases.push(node)
    return node
  },
  createTreeWalker: () => ({ nextNode: () => null }),
  createRange: () => ({
    setStart() {},
    setEnd() {},
    selectNodeContents() {},
    collapse() {},
    getBoundingClientRect: () => ({ top: 100, left: 120, width: 0, height: 0 }),
    toString: () => leadText,
  }),
  getElementById: () => null,
  querySelector: () => queryResult,
  querySelectorAll: () => [],
  addEventListener: (type) => listeners.push(type),
  removeEventListener: (type) => {
    const index = listeners.indexOf(type)
    if (index !== -1) listeners.splice(index, 1)
  },
  execCommand: () => true,
}
globalThis.window = {
  innerWidth: 1440,
  innerHeight: 900,
  setTimeout: (fn) => {
    fn()
    return 1
  },
  clearTimeout: () => {},
  setInterval: (fn, ms) => {
    intervals.push({ fn, ms })
    return intervals.length
  },
  clearInterval: () => {},
  addEventListener: (type) => listeners.push('win:' + type),
  removeEventListener: (type) => {
    const index = listeners.indexOf('win:' + type)
    if (index !== -1) listeners.splice(index, 1)
  },
  getSelection: () => selectionStub,
}
globalThis.InputEvent = class InputEvent {
  constructor(type) {
    this.type = type
  }
}

/* --- stub React ------------------------------------------------------- */

const effectCleanups = []
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [initial, () => {}],
  useRef: (initial) => ({ current: initial ?? null }),
  useEffect: (fn) => {
    const cleanup = fn()
    if (typeof cleanup === 'function') effectCleanups.push(cleanup)
  },
}

/* --- load the module the way dsh does --------------------------------- */

let loaded = null
globalThis.window.__ModuleLoader__ = {
  load: (entry) => {
    loaded = entry
  },
}

const source = readFileSync(join(here, '..', 'src', 'client.js'), 'utf8')
await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'))

check('module registers with the loader', loaded !== null)
check('registered id is the package name', loaded?.id === 'dsh-spell-check', String(loaded?.id))

const required = []
const moduleExports = loaded.factory((specifier) => {
  required.push(specifier)
  if (specifier === 'react') return React
  throw new Error('unexpected require: ' + specifier)
})

check('factory requires only react', required.length === 1 && required[0] === 'react', JSON.stringify(required))
check('exports apply', typeof moduleExports.apply === 'function')
check(
  'declares the services it touches',
  moduleExports.inject.join(',') === 'slots,conversation,sessions',
  JSON.stringify(moduleExports.inject),
)
check('exposes the engine for tests', typeof moduleExports.engine?.suggest === 'function')
check('exposes the controller for tests', typeof moduleExports.createController === 'function')

/* --- the embedded dictionary works with NO host ----------------------- */

const engine = moduleExports.engine
check('embedded dictionary is large', engine.size >= 10000, String(engine.size))

const theh = engine.suggest('theh')
check('embedded engine corrects "theh"', theh[0]?.word === 'the', JSON.stringify(theh))
const conn = engine.suggest('conntextion')
check('embedded engine corrects "conntextion"', conn[0]?.word === 'connection', JSON.stringify(conn))
check('embedded engine ignores a correct word', engine.suggest('connection').length === 0)
check('embedded engine ignores acronyms', engine.suggest('DSH').length === 0)

/* --- apply ------------------------------------------------------------ */

const registrations = []
let mountedContribution = null

const ctx = {
  remote: {
    $mount: async (contribution) => {
      mountedContribution = contribution
      return () => {}
    },
  },
  slots: {
    inject: (key, callback) => {
      callback()
      return () => {}
    },
    register: (config, component) => {
      registrations.push({ config, component })
      return () => {}
    },
  },
  effect: (fn) => {
    const dispose = fn()
    if (typeof dispose === 'function') effectCleanups.push(dispose)
  },
}

moduleExports.apply(ctx)

check('registers exactly one slot occupant', registrations.length === 1, String(registrations.length))
check('occupant id', registrations[0]?.config?.id === 'spell-check', String(registrations[0]?.config?.id))
check('occupant sits in the composer row', registrations[0]?.config?.name === 'conversation.input.right')
check('occupant is a component', typeof registrations[0]?.component === 'function')
check('styles injected once', styles.length === 1, String(styles.length))
check('styles carry the strip rules', String(styles[0]?.textContent ?? '').includes('.sp-strip'))
check('host link is attempted but optional', mountedContribution !== null)

/* --- mount: no visual chrome + listeners ------------------------------ */

const element = registrations[0].component()
// The seat is activation only: the user asked for no chip in the message bar,
// so the composer row must stay exactly as it was.
check('renders nothing in the composer bar', element === null || element === undefined, JSON.stringify(element))

for (const event of ['input', 'keydown', 'selectionchange', 'mousedown', 'win:resize', 'win:scroll']) {
  check(`listens for ${event}`, listeners.includes(event), JSON.stringify(listeners))
}

/* --- the controller publishes what Tab accepts ------------------------ */

const controller = moduleExports.createController(ctx)
const seen = []
controller.subscribe((state) => seen.push(state))
check('subscribe replays the current state', seen.length === 1 && seen[0].suggestions.length === 0, JSON.stringify(seen[0]))

// `check` is the same path a keystroke takes after its debounce: it stores the
// token, asks the embedded engine, and publishes to the chip.
const fakeToken = {
  text: 'theh',
  startOffset: 0,
  endOffset: 4,
  node: fakeElement('div'),
  range: { getBoundingClientRect: () => ({ top: 100, left: 120, width: 0, height: 0 }) },
}
controller.check(fakeToken)
const latest = seen[seen.length - 1]
check('controller publishes the typed word', latest.word === 'theh', JSON.stringify(latest.word))
check('controller publishes a suggestion', latest.suggestions[0]?.word === 'the', JSON.stringify(latest.suggestions))
check('controller publishes a Tab-ready active index', latest.active === 0)

// A correct word publishes nothing to accept.
controller.check({ ...fakeToken, text: 'connection' })
check(
  'controller clears the offer for a correct word',
  seen[seen.length - 1].suggestions.length === 0,
  JSON.stringify(seen[seen.length - 1]),
)

/* --- attach/detach, and the single-controller rule -------------------- */

// The mounted component above already owns a controller. Attaching another must
// DISPOSE the first rather than run two of them side by side: that duplication
// is what produced two strips on screen, one of which ignored every click.
const attachable = moduleExports.createController(ctx)
const detach = attachable.attach()
check(
  'only one controller listens at a time',
  listeners.filter((event) => event === 'input').length === 1,
  JSON.stringify(listeners),
)
check('the newest controller claims the window slot', globalThis.window.__dshSpellCheck?.controller === attachable)
detach()
check(
  'detach removes its listeners',
  listeners.filter((event) => event === 'input').length === 0,
  JSON.stringify(listeners),
)
check('detach releases the window slot', globalThis.window.__dshSpellCheck === undefined)

/* --- the stale-underline regression ----------------------------------- */

// The reported bug: after pressing Enter to send, the blue underline stayed
// floating in mid-air over the now-empty composer, and only vanished when a
// screenshot hotkey caused an unrelated focus/resize repaint. Root cause: the
// full-window canvas was repainted ONLY by keyboard/selection events, and a
// programmatic draft-clear that moves focus out of the editor fires none of
// them. These checks prove the canvas now repaints from the DOM itself.

const fakeBox = { top: 100, left: 120, width: 600, height: 40 }
const fakeEditor = {
  textContent: 'theh',
  getBoundingClientRect: () => fakeBox,
}
queryResult = fakeEditor

const underliner = moduleExports.createUnderliner()
const underlineCanvas = createdCanvases[createdCanvases.length - 1]
const releaseUnderline = underliner.attach()

check('underliner paints once on attach', underlineCanvas.__draws.clear === 1, String(underlineCanvas.__draws.clear))
check('underliner watches the editor DOM', mutationCallback !== null)
check('underliner exposes observe', typeof underliner.observe === 'function')

// Path A — the actual bug: the draft is cleared programmatically (send) and NO
// keyboard or selection event fires. The MutationObserver must still repaint.
fakeEditor.textContent = ''
mutationCallback()
check(
  'a programmatic clear repaints with no keyboard event',
  underlineCanvas.__draws.clear === 2,
  String(underlineCanvas.__draws.clear),
)

// Path B — the composer shrank/moved after send (the "mid-air" geometry). The
// self-heal tick must notice the box changed and repaint even with no mutation.
fakeBox.top = 40
const heal = intervals[intervals.length - 1].fn
heal()
check('self-heal repaints when the editor box moves', underlineCanvas.__draws.clear === 3, String(underlineCanvas.__draws.clear))

// Path C — heal is idempotent: an unchanged editor must not repaint every tick.
heal()
check('self-heal is a no-op when nothing changed', underlineCanvas.__draws.clear === 3, String(underlineCanvas.__draws.clear))

releaseUnderline()
check('detach disconnects the DOM observer', mutationCallback === null)
queryResult = null

/* --- @mention / /command suppression ---------------------------------- */

// The reported bug: typing `@Modu` opened the composer's file picker, but the
// spellcheck strip also appeared over it and stole Tab/arrows. The caret token
// must be suppressed whenever it is preceded by @ or /, so no strip shows and
// no key is intercepted while the picker owns navigation. A null token makes
// schedule() hide the strip and publish zero suggestions, which is exactly the
// condition under which onKeyDown early-returns and leaves Tab/arrows alone.

const tokenAtCaret = moduleExports.tokenAtCaret
const mentionEditor = fakeElement('div') // contains() => true
const caretIn = (data, offset) => {
  const node = { nodeType: 3, data }
  selectionStub = {
    rangeCount: 1,
    isCollapsed: true,
    getRangeAt: () => ({ startContainer: node, startOffset: offset }),
  }
  return node
}

check('exposes tokenAtCaret for tests', typeof tokenAtCaret === 'function')

caretIn('@Modu', 5)
check('@mention token is suppressed', tokenAtCaret(mentionEditor) === null)

caretIn('now need to do @Modu', 20)
check('@mention mid-sentence is suppressed', tokenAtCaret(mentionEditor) === null)

caretIn('/comm', 5)
check('/command token is suppressed', tokenAtCaret(mentionEditor) === null)

caretIn('Modu', 4)
check('a plain word is still a token', tokenAtCaret(mentionEditor)?.text === 'Modu')

caretIn('wether', 6)
check('a plain misspelling is still a token', tokenAtCaret(mentionEditor)?.text === 'wether')

// Trigger in a previous node: the token starts at offset 0 of its own node, so
// the lookbehind must read the wider draft (leadText), not just the local node.
leadText = '@'
caretIn('Modu', 4)
check('cross-node @ trigger is suppressed', tokenAtCaret(mentionEditor) === null)

leadText = 'hello '
caretIn('Modu', 4)
check('cross-node plain context keeps the token', tokenAtCaret(mentionEditor)?.text === 'Modu')
leadText = ''
selectionStub = null

/* --- unmount ---------------------------------------------------------- */

for (const cleanup of effectCleanups) cleanup()

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length > 0) {
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exitCode = 1
}
