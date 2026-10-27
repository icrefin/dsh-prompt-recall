/**
 * The recalled prompt's short stay between two Sessions.
 *
 * The text is handed over on the Session the user is leaving and collected on
 * the Session that replaces it, so it cannot ride React state: the two
 * controllers never render at the same time. A module-level slot keyed by
 * session identity is the whole mechanism, and it is intentionally small — a
 * staged draft is consumed within a second or discarded.
 *
 * @module dsh-prompt-recall/client/staging
 */

/** Prompt text waiting for its session's composer to mount. */
const staged = new Map<string, string>()

/** How long a staged draft keeps trying before it is dropped. */
export const RESTORE_WINDOW_MS = 2_000

/**
 * Stage the recalled text for one session.
 * @param sessionId - the session that will own the draft.
 * @param text - the recalled prompt.
 */
export function stageDraft(sessionId: string, text: string): void {
  staged.set(sessionId, text)
}

/**
 * Read the staged text for one session without consuming it.
 * @param sessionId - the session whose draft was staged.
 * @returns the staged prompt, or undefined when nothing is staged.
 */
export function stagedDraft(sessionId: string): string | undefined {
  return staged.get(sessionId)
}

/**
 * Drop a staged draft once it has been applied, aborted, or timed out.
 * @param sessionId - the session whose draft was staged.
 * @param text - the text the caller applied; a newer staged value is kept.
 */
export function releaseDraft(sessionId: string, text: string): void {
  if (staged.get(sessionId) === text) staged.delete(sessionId)
}