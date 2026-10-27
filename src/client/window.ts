/**
 * Reading the latest human prompt out of one Session's loaded event window,
 * and deciding where a "rewind" fork must be cut.
 *
 * ## Why the event window
 *
 * The browser already holds a Session-authorized, contiguous, gap-free event
 * window per Session binding (`SessionBinding.eventSource`) — the same source
 * the Chat view assembles its transcript from. Reading the prompt there gives
 * the exact durable text and the exact durable `seq`, with no extra Remote
 * round-trip and no dependence on the rendered bubble (whose text is a
 * presentation projection: reference chips collapse `@path` to a label, and
 * whitespace is reflowed).
 *
 * ## Why the boundary is not simply `seq - 1`
 *
 * A prompt reaches the Agent through the Inbox: the composer splices it into
 * `next-turn` (or `next-step`), and the claim that removes it is a *later*
 * event. Forking at `promptSeq - 1` therefore cuts a prefix whose folded Inbox
 * still holds the prompt as pending work — the child Session would carry the
 * withdrawn prompt as a queued message, and a resumed Agent could run it again.
 * So the cut is placed immediately *before* the splice that queued the prompt,
 * which is the last event that has to be excluded for the prompt to be gone.
 *
 * @module dsh-prompt-recall/client/window
 */

/** One durable Session event, as much of it as this plugin reads. */
export interface SessionEventLike {
  readonly type: string
  readonly seq: number
  readonly time?: number
  /** Surface intent; `'append'` or absent for a plain tail append. */
  readonly surfaceOp?: unknown
  readonly data?: unknown
}

/** One entry of the client event window: a durable event or a transient frame. */
export interface SessionEventEntry {
  readonly type: string
  readonly event?: SessionEventLike
}

/** The observable event-window value a Session binding publishes. */
export interface SessionEventWindow {
  readonly entries: readonly SessionEventEntry[]
  readonly hasMore: boolean
  readonly revision: number
}

/** Everything one recall gesture needs, resolved against the live window. */
export interface RecallPlan {
  /** Durable sequence of the `user/message` event that carried the prompt. */
  readonly seq: number
  /** Durable message identity; matches the Inbox occurrence that queued it. */
  readonly messageId: string
  /** The prompt exactly as it was sent. */
  readonly text: string
  /**
   * Inclusive `atSeq` for the rewind fork, or null when the prompt is the
   * window's first event and no prefix exists to cut.
   */
  readonly boundary: number | null
}

/** What one `agent/inbox/spliced` payload is read for. */
interface InboxSpliceData {
  readonly inserted?: unknown
}

/** One occurrence spliced into the Inbox. */
interface InboxOccurrence {
  readonly id?: unknown
  readonly source?: unknown
}

/** What one `user/message` payload is read for. */
interface UserMessageData {
  readonly id?: unknown
  readonly content?: unknown
  readonly source?: unknown
}

/** Read a non-empty string field. */
function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' && field.length > 0 ? field : undefined
}

/** Read an object field. */
function objectField(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'object' && field !== null ? (field as Record<string, unknown>) : undefined
}

/** Whether an event is a plain tail append (the `user/message` case we accept). */
function isAppendSurface(event: SessionEventLike): boolean {
  return event.surfaceOp === undefined || event.surfaceOp === 'append'
}

/**
 * Project one prompt's content blocks to plain text.
 *
 * The composer sends one text block; anything else (an image or file block)
 * has no draft form to restore, so it is dropped rather than guessed at.
 *
 * @param content - the `user/message` content array.
 * @returns the text blocks joined by a blank line, possibly empty.
 */
export function promptText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const candidate = block as Record<string, unknown>
    if (candidate['type'] !== 'text') continue
    const text = candidate['text']
    if (typeof text === 'string') parts.push(text)
  }
  return parts.join('\n\n')
}

/**
 * Find the newest human prompt in one loaded event window.
 *
 * "Human" is the recorded `source.kind === 'user'`: it excludes the injected
 * `user/message` events the Host writes for workspace instructions, runtime
 * context, approvals and Inbox notifications, all of which share the same
 * event type and are not something a user can recall.
 *
 * @param window - the Session binding's current event window.
 * @returns the prompt's sequence, identity and text, or null when the window
 *   holds no human prompt.
 */
export function latestUserPrompt(
  window: SessionEventWindow,
): { seq: number; messageId: string; text: string } | null {
  for (let index = window.entries.length - 1; index >= 0; index -= 1) {
    const entry = window.entries[index]
    if (entry?.type !== 'event') continue
    const event = entry.event
    if (event?.type !== 'user/message') continue
    if (!isAppendSurface(event)) continue
    const data = event.data as UserMessageData | undefined
    const source = objectField(data, 'source')
    if (stringField(source, 'kind') !== 'user') continue
    const messageId = stringField(data, 'id')
    if (messageId === undefined) continue
    const text = promptText(data?.content)
    if (text.trim() === '') continue
    return { seq: event.seq, messageId, text }
  }
  return null
}

/**
 * Resolve the rewind boundary for one prompt.
 *
 * The first choice is the event immediately before the Inbox splice that
 * queued the prompt (see the module doc). When the window holds no such splice
 * — an older event shape, or a prompt admitted without an Inbox occurrence —
 * the enclosing `turn/start` is used instead, so the cut still lands on a turn
 * boundary rather than inside the turn being withdrawn. `null` means there is
 * nothing before the prompt to keep.
 *
 * @param window - the Session binding's current event window.
 * @param prompt - the prompt resolved by {@link latestUserPrompt}.
 * @returns the inclusive boundary sequence, or null when the prefix is empty.
 */
export function rewindBoundary(
  window: SessionEventWindow,
  prompt: { seq: number; messageId: string },
): number | null {
  const events: SessionEventLike[] = []
  for (const entry of window.entries) {
    if (entry.type !== 'event' || entry.event === undefined) continue
    if (entry.event.seq > prompt.seq) continue
    events.push(entry.event)
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined || event.seq >= prompt.seq) continue
    if (event.type !== 'agent/inbox/spliced') continue
    const data = event.data as InboxSpliceData | undefined
    const inserted = data?.inserted
    if (!Array.isArray(inserted)) continue
    const queued = inserted.some(
      (occurrence: unknown) => stringField(occurrence as InboxOccurrence, 'id') === prompt.messageId,
    )
    if (queued) return positive(event.seq - 1)
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined || event.seq >= prompt.seq) continue
    if (event.type === 'turn/start') return positive(event.seq - 1)
  }
  return null
}

/** Normalize a boundary to `null` when it would fall before the first event. */
function positive(value: number): number | null {
  return value >= 0 ? value : null
}

/**
 * Plan one recall against the live event window.
 * @param window - the Session binding's current event window.
 * @returns the plan, or null when the window holds no recallable prompt.
 */
export function planRecall(window: SessionEventWindow): RecallPlan | null {
  const prompt = latestUserPrompt(window)
  if (prompt === null) return null
  return {
    seq: prompt.seq,
    messageId: prompt.messageId,
    text: prompt.text,
    boundary: rewindBoundary(window, prompt),
  }
}