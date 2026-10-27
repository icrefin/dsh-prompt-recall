// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  conversationRoot,
  findActionsRow,
  shippedActionClass,
} from '../src/client/anchor.ts'

/** Build one Conversation occurrence with the given user rows. */
function occurrence(sessionId: string, messageCount: number, hidden: readonly number[] = []): HTMLElement {
  const root = document.createElement('div')
  root.setAttribute('data-conversation-content', '')
  root.setAttribute('data-conversation-session', sessionId)
  for (let index = 0; index < messageCount; index += 1) {
    const row = document.createElement('div')
    row.setAttribute('data-chat-flow-kind', 'user')
    if (hidden.includes(index)) row.setAttribute('hidden', '')
    const stack = document.createElement('div')
    const actions = document.createElement('div')
    actions.setAttribute('data-clock', 'start')
    const copy = document.createElement('button')
    copy.setAttribute('class', 'ppByMG_action')
    actions.append(copy)
    row.append(stack, actions)
    root.append(row)
  }
  const seat = document.createElement('div')
  seat.setAttribute('data-composer-seat', '')
  root.append(seat)
  document.body.append(root)
  return root
}

describe('conversationRoot', () => {
  it('resolves the occurrence holding the composer marker', () => {
    const root = occurrence('session-a', 1)
    const marker = root.querySelector('[data-composer-seat]')
    expect(conversationRoot(marker, 'session-a')).toBe(root)
  })

  it('refuses an occurrence belonging to another session', () => {
    const root = occurrence('session-a', 1)
    const marker = root.querySelector('[data-composer-seat]')
    expect(conversationRoot(marker, 'session-b')).toBeNull()
  })

  it('answers null for a detached element', () => {
    expect(conversationRoot(document.createElement('span'), 'session-a')).toBeNull()
  })
})

describe('findActionsRow', () => {
  it('picks the newest visible user row', () => {
    const root = occurrence('session-a', 3)
    const rows = root.querySelectorAll('[data-chat-flow-kind="user"]')
    expect(findActionsRow(root)).toBe(rows[2]?.querySelector('[data-clock="start"]'))
  })

  it('skips rows Chat folded away', () => {
    const root = occurrence('session-a', 3, [2])
    const rows = root.querySelectorAll('[data-chat-flow-kind="user"]')
    expect(findActionsRow(root)).toBe(rows[1]?.querySelector('[data-clock="start"]'))
  })

  it('answers null without a user row', () => {
    const root = occurrence('session-a', 0)
    expect(findActionsRow(root)).toBeNull()
  })

  it('stays inside the occurrence it was given', () => {
    const first = occurrence('session-a', 1)
    const second = occurrence('session-b', 1)
    const secondRow = second.querySelector('[data-clock="start"]')
    expect(findActionsRow(first)).not.toBe(secondRow)
  })
})

describe('shippedActionClass', () => {
  it('copies the sibling button class', () => {
    const root = occurrence('session-a', 1)
    expect(shippedActionClass(findActionsRow(root))).toBe('ppByMG_action')
  })

  it('answers undefined when the row renders no button', () => {
    const row = document.createElement('div')
    row.setAttribute('data-clock', 'start')
    expect(shippedActionClass(row)).toBeUndefined()
    expect(shippedActionClass(null)).toBeUndefined()
  })
})