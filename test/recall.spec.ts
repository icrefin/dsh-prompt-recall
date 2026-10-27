import { describe, expect, it, vi } from 'vitest'
import { performRecall, type RecallPorts } from '../src/client/recall.ts'
import type { RecallPlan } from '../src/client/window.ts'

/** A plan that keeps a prefix. */
const REWINDABLE: RecallPlan = {
  seq: 8,
  messageId: 'prompt-1',
  text: 'recall me',
  boundary: 2,
}

/** A plan for a prompt that is the session's first event. */
const FIRST: RecallPlan = { ...REWINDABLE, seq: 0, boundary: null }

/** Ports recording the order in which they were touched. */
function recordingPorts(overrides: Partial<RecallPorts> = {}): {
  ports: RecallPorts
  calls: string[]
  cancel: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  archive: ReturnType<typeof vi.fn>
  reportArchiveFailure: ReturnType<typeof vi.fn>
} {
  const calls: string[] = []
  const cancel = vi.fn(async () => {
    calls.push('cancel')
  })
  const restore = vi.fn((childId: string, text: string) => {
    calls.push(`restore:${childId}:${text}`)
  })
  const open = vi.fn((childId: string) => {
    calls.push(`open:${childId}`)
  })
  const archive = vi.fn(async (sessionId: string) => {
    calls.push(`archive:${sessionId}`)
  })
  const reportArchiveFailure = vi.fn((childId: string) => {
    calls.push(`reportArchiveFailure:${childId}`)
  })
  const ports: RecallPorts = {
    cancel,
    fork: async (sessionId, atSeq) => {
      calls.push(`fork:${sessionId}:${String(atSeq)}`)
      return 'child'
    },
    create: async (sessionId) => {
      calls.push(`create:${sessionId}`)
      return 'fresh'
    },
    restore,
    open,
    archive,
    reportArchiveFailure,
    ...overrides,
  }
  return { ports, calls, cancel, restore, open, archive, reportArchiveFailure }
}

describe('performRecall', () => {
  it('stops, forks at the boundary, stages the text, navigates, then retires the source', async () => {
    const { ports, calls } = recordingPorts()
    const outcome = await performRecall(ports, 'parent', REWINDABLE)

    expect(outcome).toEqual({ kind: 'rewound', childId: 'child', archived: true })
    expect(calls).toEqual([
      'cancel',
      'fork:parent:2',
      'restore:child:recall me',
      'open:child',
      'archive:parent',
    ])
  })

  it('replaces the session when the prompt was the first event', async () => {
    const { ports, calls } = recordingPorts()
    const outcome = await performRecall(ports, 'parent', FIRST)

    expect(outcome).toEqual({ kind: 'replaced', childId: 'fresh', archived: true })
    expect(calls).toEqual([
      'cancel',
      'create:parent',
      'restore:fresh:recall me',
      'open:fresh',
      'archive:parent',
    ])
  })

  it('still rewinds when stopping the turn fails', async () => {
    const { ports, calls } = recordingPorts({
      cancel: async () => {
        calls.push('cancel')
        throw new Error('session/agent-busy')
      },
    })
    const outcome = await performRecall(ports, 'parent', REWINDABLE)

    expect(outcome.kind).toBe('rewound')
    expect(calls).toEqual([
      'cancel',
      'fork:parent:2',
      'restore:child:recall me',
      'open:child',
      'archive:parent',
    ])
  })

  it('propagates a fork failure without staging, navigating or retiring', async () => {
    const { ports, restore, open, archive } = recordingPorts({
      fork: async () => {
        throw new Error('session/fork-unavailable')
      },
    })

    await expect(performRecall(ports, 'parent', REWINDABLE)).rejects.toThrow('session/fork-unavailable')
    expect(restore).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    expect(archive).not.toHaveBeenCalled()
  })

  it('keeps the gesture when the source cannot be retired, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { ports, calls, reportArchiveFailure } = recordingPorts({
      archive: async () => {
        throw new Error('workspace/unknown-session')
      },
    })
    const outcome = await performRecall(ports, 'parent', REWINDABLE)
    warn.mockRestore()

    expect(outcome).toEqual({ kind: 'rewound', childId: 'child', archived: false })
    // The rewind and the restored draft still happened; the notice is the extra.
    expect(calls).toEqual([
      'cancel',
      'fork:parent:2',
      'restore:child:recall me',
      'open:child',
      'reportArchiveFailure:child',
    ])
    expect(reportArchiveFailure).toHaveBeenCalledWith('child')
  })

  it('retires the source after the navigation, never before', async () => {
    const { ports, calls } = recordingPorts()
    await performRecall(ports, 'parent', REWINDABLE)

    // Archiving clears the main panel when the archived session is the one on
    // screen, so `open` must come first.
    expect(calls.indexOf('open:child')).toBeLessThan(calls.indexOf('archive:parent'))
  })
})