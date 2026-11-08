/**
 * Stylesheet sanity check: `node scripts/check-styles.mjs`.
 *
 * The client half builds one CSS string from an array of literals. A rule whose
 * selector line is removed leaves its declarations behind, and those orphans
 * break the parse of every rule after them — which is exactly how the
 * right-click menu lost its positioning and rendered as raw text at the bottom
 * of the page. This asserts the string is structurally composed of real rules.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'src', 'client.js'), 'utf8')

const start = source.indexOf('function styles()')
const end = source.indexOf('].join', start)
if (start === -1 || end === -1) {
  console.error('check-styles: could not locate styles()')
  process.exit(1)
}

const block = source.slice(start, end)
const css = block
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.startsWith('"'))
  .map((line) => line.replace(/^"/, '').replace(/",?$/, ''))
  .join('')

let passed = 0
const failures = []
const check = (name, ok, detail) => {
  if (ok) passed += 1
  else failures.push(name + (detail === undefined ? '' : ` — ${detail}`))
}

const open = (css.match(/\{/g) ?? []).length
const close = (css.match(/\}/g) ?? []).length
check('braces balance', open === close, `${open} open vs ${close} close`)

// Every top-level statement must start with a selector, an at-rule, or a
// comment. A bare declaration at the start of a statement is the orphan shape.
const statements = css.split('}')
for (const statement of statements) {
  const trimmed = statement.trim()
  if (trimmed === '') continue
  check(
    'statement starts with a selector',
    /^(\.|@|:root|html|body|\/\*)/.test(trimmed),
    trimmed.slice(0, 60),
  )
}

// The rules that carry the two visible surfaces must survive.
check('strip rule present', css.includes('.sp-strip{'))
check('menu rule present', css.includes('.sp-menu{'))
check('menu open state present', css.includes('.sp-menu.sp-open{'))
check('menu positions itself', /\.sp-menu\{[^}]*position:fixed/.test(css))

// The chip was removed from the UI; nothing should reference it any more.
check('no chip rules left', css.includes('.sp-chip') === false)

console.log(`${passed} passed, ${failures.length} failed`)
if (failures.length > 0) {
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exitCode = 1
}
