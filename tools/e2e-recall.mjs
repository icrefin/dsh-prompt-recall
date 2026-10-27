/**
 * End-to-end check for dsh-prompt-recall against a booted dev profile.
 *
 * It drives a real Chromium over CDP: boots the web client, opens a seeded
 * session whose log carries a known last prompt, asserts the recall button is
 * mounted in that prompt's shipped action row, clicks it, and then asserts the
 * three effects the gesture promises — the conversation moved on, the withdrawn
 * prompt is gone from the transcript, and its text is back in the composer.
 *
 * Usage:
 *   scripts/dev-profile.sh boot 19498 &        # or run it in another shell
 *   node tools/e2e-recall.mjs <url-with-token> <session-title> <prompt-prefix>
 *
 * Exits non-zero on the first failed assertion, and prints the browser console
 * errors it observed either way (a client plugin that throws is exactly what
 * this is looking for).
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CDP_PORT = 9333
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [url, sessionTitle, promptPrefix] = process.argv.slice(2)

if (!url || !sessionTitle || !promptPrefix) {
  console.error('usage: node tools/e2e-recall.mjs <url-with-token> <session-title> <prompt-prefix>')
  process.exit(2)
}

/** Collected page-side problems, reported on exit. */
const problems = []
let chrome
let socket
let profileDir
let nextId = 0
const pending = new Map()

/** Resolve once the CDP socket is usable. */
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    socket = new WebSocket(wsUrl)
    socket.addEventListener('open', () => {
      resolve()
    })
    socket.addEventListener('error', (event) => {
      reject(new Error(`cdp socket failed: ${String(event.message ?? 'error')}`))
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id !== undefined) {
        const entry = pending.get(message.id)
        pending.delete(message.id)
        if (entry === undefined) return
        if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
        else entry.resolve(message.result)
        return
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        problems.push(`console.error: ${describeArgs(message.params.args)}`)
      }
      if (message.method === 'Runtime.exceptionThrown') {
        problems.push(`exception: ${message.params.exceptionDetails.text} ${message.params.exceptionDetails.exception?.description ?? ''}`)
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        problems.push(`log: ${message.params.entry.text}`)
      }
    })
  })
}

/** Render CDP console arguments as one line. */
function describeArgs(args) {
  return (args ?? [])
    .map((arg) => (typeof arg.value === 'string' ? arg.value : (arg.description ?? arg.type)))
    .join(' ')
    .slice(0, 300)
}

/** Send one CDP command. */
function send(method, params = {}) {
  const id = (nextId += 1)
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

/** Evaluate an expression in the page and return its value. */
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.exceptionDetails) {
    throw new Error(`page threw: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`)
  }
  return result.result.value
}

/** Poll an expression until it answers truthy. */
async function waitFor(expression, label, timeoutMs = 30_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    let value
    try {
      value = await evaluate(expression)
    } catch (error) {
      if (Date.now() > deadline) throw error
      await sleep(intervalMs)
      continue
    }
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await sleep(intervalMs)
  }
}

/** Sleep helper. */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** Assert a condition, recording a readable failure. */
function check(label, condition, detail = '') {
  const mark = condition ? 'ok  ' : 'FAIL'
  console.log(`${mark} ${label}${detail === '' ? '' : ` — ${detail}`}`)
  if (!condition) problems.push(`assertion failed: ${label} ${detail}`)
}

/** Dismiss the first-run preview notice the dev profile shows once. */
const DISMISS_ONBOARDING = `
(() => {
  const labels = ['Continue', 'Configure later', 'Skip', 'Got it', 'OK',
    '\u7ee7\u7eed', '\u7a0d\u540e\u914d\u7f6e', '\u4ee5\u540e\u914d\u7f6e', '\u8df3\u8fc7', '\u77e5\u9053\u4e86', '\u597d\u7684']
  const button = [...document.querySelectorAll('button')].find(
    (candidate) => labels.includes((candidate.textContent ?? '').trim()) && candidate.offsetParent !== null,
  )
  if (button === undefined) return false
  button.click()
  return true
})()`

/** Find one session row in the sidebar and open it. */
const OPEN_SESSION = `
(() => {
  const title = ${JSON.stringify(sessionTitle)}
  const matches = [...document.querySelectorAll('body *')].filter(
    (el) => (el.textContent ?? '').trim().startsWith(title) && el.offsetParent !== null,
  )
  const target = matches.at(-1)
  if (target === undefined) return false
  target.click()
  return true
})()`

/** Whether the sidebar's expanded column is showing (the dev profile is English). */
const SIDEBAR_EXPANDED = `document.body.innerText.includes('Workspaces')`

/**
 * Expand the sidebar rail. Guarded by the expanded check so a second call can
 * never toggle the column back into the rail.
 */
const EXPAND_SIDEBAR = `
(() => {
  if (document.body.innerText.includes('Workspaces')) return 'already-expanded'
  const at = document.elementFromPoint(26, 27)
  const button = at?.closest('button') ?? null
  if (button === null) return 'no-toggle'
  button.click()
  return 'clicked'
})()`

/**
 * Open the seeded session, expanding the sidebar rail first when needed.
 * @returns whether the session row was found and clicked.
 */
async function openSession() {
  const deadline = Date.now() + 60_000
  let expands = 0
  for (;;) {
    if (await evaluate(OPEN_SESSION)) return true
    // First-run modals (the preview notice, then the provider setup) appear
    // after `document complete`, so they are dismissed inside this loop rather
    // than once before it.
    await evaluate(DISMISS_ONBOARDING)
    // The rail starts collapsed and lists no sessions. Two attempts, each
    // guarded by the expanded check, then give up rather than toggling forever.
    if (expands < 2 && Date.now() > deadline - 45_000) {
      const expanded = await evaluate(SIDEBAR_EXPANDED)
      if (!expanded) {
        expands += 1
        console.log(`sidebar expand: ${String(await evaluate(EXPAND_SIDEBAR))}`)
      }
    }
    if (Date.now() > deadline) return false
    await sleep(500)
  }
}

/** The dev home the profile under test writes to. */
const DEV_HOME = resolve(import.meta.dirname, '..', '.dev-home')

/**
 * Read the Host's durable archive set straight off the dev home.
 *
 * The gesture's retirement promise is a registry write, not a render: the
 * sidebar also hides the row for other reasons (a row shows `Untitled` until
 * its durable title is projected, and archived rows are filtered by a view
 * option the driver would have to drive the UI to change).
 *
 * @returns the archived session ids, or an empty list when the registry is unreadable.
 */
function archivedSessionIds() {
  try {
    const state = JSON.parse(readFileSync(join(DEV_HOME, 'storages', 'workspace.json'), 'utf8'))
    const ids = state?.global?.archivedSessionIds
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

/** Snapshot of everything the assertions read. */

/** Snapshot of everything the assertions read. */
const SNAPSHOT = `
(() => {
  const root = document.querySelector('[data-conversation-content]')
  const userRows = [...document.querySelectorAll('[data-chat-flow-kind="user"]')]
    .filter((row) => row.closest('[hidden]') === null)
  const last = userRows.at(-1)
  const actions = last?.querySelector('[data-clock="start"]') ?? null
  const owned = document.querySelector('[data-dsh-prompt-recall]')
  const composer = document.querySelector('[data-conversation-content] [contenteditable="true"]')
  return {
    hasRoot: root !== null,
    sessionId: root?.getAttribute('data-conversation-session') ?? null,
    userRowCount: userRows.length,
    lastPromptText: (last?.textContent ?? '').slice(0, 400),
    hasActionsRow: actions !== null,
    ownedParentIsActionsRow: owned !== null && owned.parentElement === actions,
    ownedSiblingCount: actions === null ? -1 : actions.querySelectorAll('button').length,
    ownedClass: owned?.getAttribute('class') ?? null,
    ownedLabel: owned?.getAttribute('aria-label') ?? null,
    composerText: (composer?.textContent ?? '').slice(0, 400),
    composerFound: composer !== null,
  }
})()`

try {
  profileDir = mkdtempSync(join(tmpdir(), 'dsh-e2e-'))
  chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  )

  const list = await waitForFetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
  const page = list.find((target) => target.type === 'page')
  if (page === undefined) throw new Error('no page target')
  await connect(page.webSocketDebuggerUrl)
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')

  await send('Page.navigate', { url })
  await waitFor(`document.readyState === 'complete'`, 'document ready', 60_000)
  console.log('boot: document complete')

  // The rail starts collapsed; the session list only exists in the expanded
  // column, so expand it once the boot has settled.
  const opened = await openSession()
  check('session row found in the sidebar', opened === true)
  await waitFor(
    `document.querySelectorAll('[data-chat-flow-kind="user"]').length > 0`,
    'transcript user rows',
    60_000,
  )

  const before = await evaluate(SNAPSHOT)
  check('conversation occurrence rendered', before.hasRoot, String(before.sessionId))
  check('recall button mounted', before.ownedParentIsActionsRow, `class=${String(before.ownedClass)}`)
  // A user row renders copy for sure; branch is omitted for user messages, so
  // the shipped row holds one button and ours makes two.
  check(
    'recall button sits beside the shipped actions',
    before.ownedSiblingCount >= 2,
    `buttons in row: ${String(before.ownedSiblingCount)}`,
  )
  check(
    'recall button borrows the shipped action class',
    typeof before.ownedClass === 'string' && before.ownedClass.length > 0,
    String(before.ownedClass),
  )
  // The same dictionary key feeds the tooltip and the accessible name.
  check('recall button carries its tooltip label', before.ownedLabel === 'Recall', String(before.ownedLabel))
  const expectedPrompt = before.lastPromptText.includes(promptPrefix)
  check('newest prompt is the seeded one', expectedPrompt, before.lastPromptText.slice(0, 80))
  check('composer starts empty', before.composerFound && before.composerText.trim() === '')

  await capture('recall-button')
  await evaluate(`document.querySelector('[data-dsh-prompt-recall]').click()`)
  console.log('click: recall')
  await waitFor(
    `document.querySelector('[data-conversation-content]')?.getAttribute('data-conversation-session') !== ${JSON.stringify(before.sessionId)}`,
    'conversation switch',
    30_000,
  )
  await waitFor(
    `(document.querySelector('[data-conversation-content] [contenteditable="true"]')?.textContent ?? '') !== ''`,
    'restored draft',
    15_000,
  )

  const after = await evaluate(SNAPSHOT)
  check('conversation continued in a new session', after.sessionId !== before.sessionId, String(after.sessionId))
  check('recall button re-armed under the previous prompt', after.ownedParentIsActionsRow)
  check(
    'withdrawn prompt left the transcript',
    !after.lastPromptText.includes(promptPrefix),
    after.lastPromptText.slice(0, 80),
  )
  check('recalled text is back in the composer', after.composerText.includes(promptPrefix), after.composerText.slice(0, 80))
  await capture('recall-after')

  // Retirement is asserted against the durable registry rather than the sidebar:
  // a row's rendered text carries its relative age, and a freshly copied session
  // shows "Untitled" until its title is projected. The registry is the promise.
  await sleep(1_000)
  const archived = archivedSessionIds()
  check(
    'superseded session retired into the archive set',
    Array.isArray(archived) && archived.includes(before.sessionId),
    JSON.stringify(archived).slice(0, 120),
  )
  check('continuing session is not archived', !archived.includes(after.sessionId))
} catch (error) {
  problems.push(`driver: ${String(error?.stack ?? error)}`)
  await dumpPageState()
} finally {
  try {
    await send('Browser.close')
  } catch {
    /* the browser may already be gone */
  }
  socket?.close()
  chrome?.kill('SIGKILL')
  if (profileDir !== undefined) rmSync(profileDir, { recursive: true, force: true })
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('\nall checks passed')
process.exit(0)

/** Poll an HTTP endpoint until it answers JSON. */
async function waitForFetch(endpoint, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const response = await fetch(endpoint)
      if (response.ok) return await response.json()
    } catch {
      /* the browser is still starting */
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${endpoint}`)
    await sleep(250)
  }
}

/** Save a screenshot of the current page for visual inspection. */
async function capture(name) {
  try {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const target = `/tmp/dsh-e2e-${name}.png`
    writeFileSync(target, Buffer.from(shot.data, 'base64'))
    console.log(`shot: ${target}`)
  } catch (error) {
    console.error(`(no screenshot: ${String(error)})`)
  }
}

/** Print what the page was showing when an assertion or the driver failed. */
async function dumpPageState() {
  try {
    const text = await evaluate('document.body.innerText.slice(0, 2500)')
    console.error('\n--- page text at failure ---\n' + String(text))
    const rows = await evaluate(`
      [...document.querySelectorAll('button, [role="button"], a, li')]
        .filter((el) => el.offsetParent !== null)
        .slice(0, 30)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? '').trim().slice(0, 40),
          attrs: [...el.attributes].map((a) => a.name + '=' + a.value.slice(0, 30)).join(' ').slice(0, 160),
        }))`)
    console.error('--- visible controls ---')
    for (const row of rows ?? []) console.error(`  <${row.tag}> ${JSON.stringify(row.text)} :: ${row.attrs}`)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const target = '/tmp/dsh-e2e-failure.png'
    writeFileSync(target, Buffer.from(shot.data, 'base64'))
    console.error(`--- screenshot: ${target} ---`)
  } catch (error) {
    console.error(`(no page dump: ${String(error)})`)
  }
}