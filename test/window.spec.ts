import { describe, expect, it } from 'vitest'
import {
  latestUserPrompt,
  planRecall,
  promptText,
  rewindBoundary,
  type SessionEventEntry,
  type SessionEventWindow,
} from '../src/client/window.ts'

/** Build one window from a compact `[seq, type, data]` description. */
function windowOf(
  rows: readonly (readonly [number, string, unknown?])[],
  surfaceOp: unknown = 'append',
): SessionEventWindow {
  const entries: SessionEventEntry[] = rows.map(([seq, type, data]) => ({
    type: 'event',
    event: { type, seq, surfaceOp, data },
  }))
  return { entries, hasMore: false, revision: rows.length }
}

/** One `user/message` payload with a source kind and text. */
function message(id: string, kind: string, text: string): unknown {
  return { id, source: { kind }, content: [{ type: 'text', text }] }
}

/** One Inbox splice payload inserting the given occurrence ids. */
function splice(...ids: string[]): unknown {
  return { target: 'next-turn', start: 0, inserted: ids.map((id) => ({ id })) }
}

/** The prompt-and-inbox shape the desktop Harness actually writes. */
const REAL_SHAPE = windowOf([
  [0, 'permission/preset'],
  [1, 'agent/inbox/spliced', { target: 'next-step', start: 0, inserted: [{ id: 'notice' }] }],
  [2, 'agent-preset/selected'],
  [3, 'agent/inbox/spliced', splice('prompt-1')],
  [4, 'turn/start', { turn: 1 }],
  [5, 'agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] }],
  [6, 'step/start', { turn: 1, step: 1 }],
  [7, 'user/message', message('notice', 'user-approval', 'approval changed')],
  [8, 'user/message', message('prompt-1', 'user', 'recall me')],
  [9, 'user/message', message('ctx', 'runtime-context', 'injected context')],
])

describe('promptText', () => {
  it('joins text blocks and drops non-text blocks', () => {
    expect(
      promptText([
        { type: 'text', text: 'first' },
        { type: 'image', attachment: {} },
        { type: 'text', text: 'second' },
      ]),
    ).toBe('first\n\nsecond')
  })

  it('answers an empty string for anything unexpected', () => {
    expect(promptText(undefined)).toBe('')
    expect(promptText('not-an-array')).toBe('')
    expect(promptText([{ type: 'text' }])).toBe('')
  })
})

describe('latestUserPrompt', () => {
  it('picks the newest human prompt and ignores injected user messages', () => {
    expect(latestUserPrompt(REAL_SHAPE)).toEqual({
      seq: 8,
      messageId: 'prompt-1',
      text: 'recall me',
    })
  })

  it('ignores a surface replacement', () => {
    const replaced: SessionEventWindow = {
      entries: [
        { type: 'event', event: { type: 'user/message', seq: 0, surfaceOp: { op: 'replace', startSeq: 0, endSeq: 0 }, data: message('m', 'user', 'old') } },
      ],
      hasMore: false,
      revision: 1,
    }
    expect(latestUserPrompt(replaced)).toBeNull()
  })

  it('answers null when the window holds no human prompt', () => {
    expect(latestUserPrompt(windowOf([[0, 'turn/start', { turn: 1 }]]))).toBeNull()
  })

  it('answers null for a blank prompt', () => {
    expect(latestUserPrompt(windowOf([[0, 'user/message', message('m', 'user', '   ')]]))).toBeNull()
  })
})

describe('rewindBoundary', () => {
  it('cuts immediately before the splice that queued the prompt', () => {
    const prompt = latestUserPrompt(REAL_SHAPE)
    expect(prompt).not.toBeNull()
    expect(rewindBoundary(REAL_SHAPE, prompt!)).toBe(2)
  })

  it('falls back to the enclosing turn start when no splice carries the prompt', () => {
    const shape = windowOf([
      [0, 'permission/preset'],
      [1, 'turn/start', { turn: 1 }],
      [2, 'user/message', message('m', 'user', 'hi')],
    ])
    const prompt = latestUserPrompt(shape)
    expect(rewindBoundary(shape, prompt!)).toBe(0)
  })

  it('answers null when nothing precedes the prompt', () => {
    const shape = windowOf([[0, 'agent/inbox/spliced', splice('m')], [1, 'user/message', message('m', 'user', 'hi')]])
    const prompt = latestUserPrompt(shape)
    expect(rewindBoundary(shape, prompt!)).toBeNull()
  })

  it('does not match a splice carrying a different occurrence', () => {
    const shape = windowOf([
      [0, 'agent/inbox/spliced', splice('other')],
      [1, 'turn/start', { turn: 1 }],
      [2, 'user/message', message('m', 'user', 'hi')],
    ])
    const prompt = latestUserPrompt(shape)
    expect(rewindBoundary(shape, prompt!)).toBe(0)
  })
})

describe('planRecall', () => {
  it('returns the text, identity and boundary together', () => {
    expect(planRecall(REAL_SHAPE)).toEqual({
      seq: 8,
      messageId: 'prompt-1',
      text: 'recall me',
      boundary: 2,
    })
  })

  it('answers null without a prompt', () => {
    expect(planRecall(windowOf([[0, 'turn/start', { turn: 1 }]]))).toBeNull()
  })
})