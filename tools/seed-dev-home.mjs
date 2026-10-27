/**
 * Seed the isolated dev home with one real session, so the end-to-end driver
 * has a conversation to recall from.
 *
 * `scripts/dev-profile.sh` boots a profile with no workspaces and no sessions,
 * and the dev home has no model credentials, so a prompt cannot be sent from
 * the UI. Copying an existing session log into the dev home's session store
 * gives the fixture a durable transcript — including a real Inbox splice for
 * its last prompt, which is exactly the shape the rewind boundary has to
 * resolve.
 *
 * Run it while the dev host is stopped (it rewrites the workspace registry),
 * then boot the profile and run `tools/e2e-recall.mjs`.
 *
 * Usage:
 *   node tools/seed-dev-home.mjs <session-dir> <workspace-path> [workspace-title]
 *
 * It prints the copied session id and its last human prompt, the two values the
 * driver needs.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const [sessionDirArg, workspacePathArg, titleArg] = process.argv.slice(2)
if (!sessionDirArg || !workspacePathArg) {
  console.error('usage: node tools/seed-dev-home.mjs <session-dir> <workspace-path> [workspace-title]')
  process.exit(2)
}

const sessionDir = resolve(sessionDirArg)
const workspacePath = resolve(workspacePathArg)
const workspaceTitle = titleArg ?? basename(workspacePath)
const sessionId = basename(sessionDir)
const devHome = resolve(import.meta.dirname, '..', '.dev-home')
const logPath = join(sessionDir, 'session.v4.jsonl.zstd')

// A session the live app is still writing makes a moving fixture: the "last
// prompt" the driver is told to expect can change between seeding and clicking.
// Prefer a session that has settled.
const settledMinutes = (Date.now() - statSync(logPath).mtimeMs) / 60_000
if (settledMinutes < 5) {
  console.warn(
    `warning: ${sessionId} was written ${settledMinutes.toFixed(1)} min ago — a live session makes a moving fixture.`,
  )
}

// The dev home's session store is keyed by the working directory with every
// path separator — a trailing one included — replaced by a dash, wrapped in one
// leading dash, exactly like the live home:
//   /Users/me/work  ->  --Users-me-work--
// The persistence layer re-derives that key from the log header and refuses a
// session whose directory name does not match, so it has to be right.
const storeKey = `-${workspacePath.replaceAll('/', '-')}--`
const destination = join(devHome, 'sessions', storeKey, sessionId)

if (!existsSync(logPath)) {
  console.error(`no session.v4.jsonl.zstd in ${sessionDir}`)
  process.exit(2)
}

rmSync(join(devHome, 'sessions'), { recursive: true, force: true })
mkdirSync(join(devHome, 'sessions', storeKey), { recursive: true })
cpSync(sessionDir, destination, { recursive: true })
rmSync(join(destination, 'session.lock'), { force: true })

const registryPath = join(devHome, 'storages', 'workspace.json')
const workspaceId = '11111111-2222-4333-8444-555555555555'
mkdirSync(join(devHome, 'storages'), { recursive: true })
writeFileSync(
  registryPath,
  JSON.stringify(
    {
      unit: { name: 'workspace', version: 2 },
      global: {
        initialized: true,
        defaultWorkspaceId: workspaceId,
        workspaceIds: [workspaceId],
        archivedSessionIds: [],
        pinnedSessionIds: [],
      },
      tables: {
        workspaces: {
          [workspaceId]: {
            path: workspacePath,
            title: workspaceTitle,
            sessionIds: [sessionId],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    },
    null,
    4,
  ),
)

/** Read the last human prompt out of the copied log, for the driver's args. */
function lastPrompt() {
  const text = execFileSync('zstd', ['-dc', join(destination, 'session.v4.jsonl.zstd')], {
    maxBuffer: 512 * 1024 * 1024,
    encoding: 'utf8',
  })
  let last = ''
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.type !== 'user/message') continue
    if (event.data?.source?.kind !== 'user') continue
    const blocks = Array.isArray(event.data.content) ? event.data.content : []
    const joined = blocks
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n\n')
    if (joined.trim() !== '') last = joined
  }
  return last
}

const prompt = lastPrompt()
console.log(`session:  ${sessionId}`)
console.log(`workspace: ${workspacePath}`)
// Only a prefix: the driver needs enough to identify the prompt, and a real
// prompt can carry anything the user typed.
console.log(`prompt:   ${prompt.split('\n')[0].slice(0, 48)}`)
