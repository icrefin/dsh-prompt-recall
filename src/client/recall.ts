/**
 * The recall gesture, expressed against its ports so it can be reasoned about
 * (and tested) without a browser, a Cordis context, or a live Host.
 *
 * The gesture is a **rewind**, not an in-place edit. A Session log is an
 * append-only durable record that a live Agent holds open; there is no
 * "delete the last turn" operation, and rewriting the log under a running
 * Agent would corrupt the session. The platform's own answer to "continue from
 * an earlier point" is `session/fork`: copy an exact event prefix into a new
 * Session. That is what the shipped branch action does, and it is what recall
 * does — cut just before the prompt was queued, so the child Session's history
 * simply does not contain it.
 *
 * A fork would leave the conversation standing twice, so recall finishes the
 * thought: the session it came from is **archived**. DSH has no session delete
 * at all (`archiveSession`/`unarchiveSession` are the whole vocabulary), which
 * suits the gesture — the record stays on disk, the withdrawn prompt stays
 * inside it, and the sidebar simply stops showing the superseded twin. It also
 * strengthens the withdrawal: the durable archive set is what a provider's
 * wake gate reads, so the retired session cannot be woken into re-running the
 * prompt the user just took back.
 *
 * @module dsh-prompt-recall/client/recall
 */

import type { RecallPlan } from './window.ts'

/** Everything the gesture needs from the runtime it runs in. */
export interface RecallPorts {
  /**
   * Stop the addressed session's in-flight turn.
   * @param sessionId - the session being rewound.
   */
  cancel(sessionId: string): Promise<void>
  /**
   * Fork the addressed session at an inclusive boundary.
   * @param sessionId - the session being rewound.
   * @param atSeq - last event sequence the child inherits.
   * @returns the child session identity.
   */
  fork(sessionId: string, atSeq: number): Promise<string>
  /**
   * Create a blank session continuing the addressed one's workspace.
   * @param sessionId - the session being replaced.
   * @returns the new session identity.
   */
  create(sessionId: string): Promise<string>
  /**
   * Hand the recalled text to the child session's composer.
   * @param childId - the session that will own the draft.
   * @param text - the recalled prompt.
   */
  restore(childId: string, text: string): void
  /**
   * Navigate the main panel to the child session.
   * @param childId - the session to open.
   */
  open(childId: string): void
  /**
   * Retire the session the gesture rewound from, so the conversation does not
   * exist twice. Distinct from deletion: the log is untouched and the session
   * can be restored.
   * @param sessionId - the superseded session.
   */
  archive(sessionId: string): Promise<void>
  /**
   * Tell the user, on the session that continues, that the superseded session
   * is still there. Called only when {@link RecallPorts.archive} rejects; the
   * caller owns the wording because this module holds no copy.
   * @param childId - the session the user is now looking at.
   */
  reportArchiveFailure(childId: string): void
}

/** How the conversation was continued. */
export type RecallKind =
  /** The history before the prompt was forked into a new Session. */
  | 'rewound'
  /** The prompt was the first event, so a blank Session took its place. */
  | 'replaced'

/** Result of one recall gesture. */
export interface RecallOutcome {
  readonly kind: RecallKind
  readonly childId: string
  /** Whether the superseded session was retired into the archive set. */
  readonly archived: boolean
}

/**
 * Run one recall gesture.
 *
 * Order matters:
 *
 * 1. **stop, tolerating failure** — the turn must not keep streaming into a
 *    conversation the user is leaving. A cancelled turn also settles the
 *    source log before the fork reads it; a rejection here (an already-idle
 *    session rejects nothing, a transport hiccup does) must not block the
 *    rewind, so it is swallowed.
 * 2. **resolve the continuation** — fork at the planned boundary, or, when the
 *    prompt was the session's first event so no prefix exists, create a blank
 *    session in the same workspace. Both leave the user with a conversation
 *    that does not contain the prompt.
 * 3. **stage the draft, then navigate** — the child's composer reads the staged
 *    text as it mounts, so the text is there before the panel switches.
 * 4. **retire the superseded session, last** — and only after the navigation:
 *    the archive action clears the main panel when the session being archived
 *    is the one on screen, so archiving first would blank the view before the
 *    child opens. It is also the one step whose failure is survivable — the
 *    gesture has already done its work — so it degrades to a notice instead of
 *    throwing.
 *
 * @param ports - runtime bindings.
 * @param sessionId - the session the gesture was started from.
 * @param plan - the plan resolved at click time.
 * @returns how the conversation was continued, its new identity, and whether
 *   the session it came from was retired.
 */
export async function performRecall(
  ports: RecallPorts,
  sessionId: string,
  plan: RecallPlan,
): Promise<RecallOutcome> {
  await ports.cancel(sessionId).catch(() => undefined)

  const kind: RecallKind = plan.boundary === null ? 'replaced' : 'rewound'
  const childId =
    plan.boundary === null
      ? await ports.create(sessionId)
      : await ports.fork(sessionId, plan.boundary)

  ports.restore(childId, plan.text)
  ports.open(childId)

  let archived = true
  try {
    await ports.archive(sessionId)
  } catch (error) {
    archived = false
    console.warn('[dsh-prompt-recall] the superseded session could not be retired', error)
    ports.reportArchiveFailure(childId)
  }
  return { kind, childId, archived }
}