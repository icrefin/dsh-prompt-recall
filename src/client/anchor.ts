/**
 * Where the recall button lives in the transcript, and how its host row is
 * found again after a re-render.
 *
 * The Chat view owns the transcript, and it exposes no slot for a user
 * message's action row: `conversation.chat.assistant-actions` and
 * `conversation.chat.turnTail` both render for a *completed* turn, so neither
 * exists while the Agent is still working — which is exactly when a recall
 * button has to be reachable. The adapter therefore addresses the shipped row
 * by its own public DOM contract instead of shadowing a shipped renderer:
 *
 *   `[data-conversation-content]`  one Conversation occurrence; carries
 *                                 `data-conversation-session`
 *   `[data-chat-flow-kind="user"]` one user/steering message flow item
 *                                 (Chat's own styling hook)
 *   `[data-clock="start"]`         the action row itself (the container the
 *                                 copy and branch buttons render into)
 *
 * Scoping to the occurrence that contains our own composer seat matters: the
 * Conversation Factory can be instantiated more than once (the main panel and a
 * Sidebar chat tab), and every rule below is resolved inside ours.
 *
 * @module dsh-prompt-recall/client/anchor
 */

/** One Conversation occurrence root. */
export const ROOT_SELECTOR = '[data-conversation-content]'

/** The occurrence's session tag. */
export const ROOT_SESSION_ATTR = 'data-conversation-session'

/** One Chat flow item carrying user or steering input. */
export const USER_ROW_SELECTOR = '[data-chat-flow-kind="user"]'

/** The icon-action row inside one user row. */
export const ACTIONS_ROW_SELECTOR = '[data-clock="start"]'

/** Marks the element this plugin owns, so re-syncs never duplicate it. */
export const OWNED_ATTR = 'data-dsh-prompt-recall'

/**
 * Resolve the Conversation occurrence that contains `from`.
 *
 * @param from - any element inside the occurrence (our own composer marker).
 * @param sessionId - the occurrence's expected session tag.
 * @returns the occurrence root, or null when `from` is detached or belongs to
 *   a different session.
 */
export function conversationRoot(from: Element | null, sessionId: string): Element | null {
  const root = from?.closest(ROOT_SELECTOR) ?? null
  if (root === null) return null
  const tagged = root.getAttribute(ROOT_SESSION_ATTR)
  if (tagged !== null && tagged !== sessionId) return null
  return root
}

/**
 * Find the action row the button belongs in: the newest *visible* user row of
 * one occurrence.
 *
 * Hidden rows are skipped because Chat folds completed-turn process members
 * with the `hidden` attribute; the last visible user row is the prompt the
 * transcript is currently showing as the latest input.
 *
 * @param root - one Conversation occurrence root.
 * @returns the action row element, or null when the transcript shows no user row.
 */
export function findActionsRow(root: Element): Element | null {
  const rows = root.querySelectorAll(USER_ROW_SELECTOR)
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (row === undefined) continue
    if (row.closest('[hidden]') !== null) continue
    const actions = row.querySelector(ACTIONS_ROW_SELECTOR)
    if (actions !== null) return actions
  }
  return null
}

/**
 * Read the class list the shipped action buttons carry.
 *
 * The row renders its own buttons through a CSS-module class, so the exact
 * class name is a build artifact. Copying it from a live sibling is what keeps
 * this button pixel-identical across Harness versions without reaching into a
 * hashed stylesheet at build time; the plugin's own fallback rules cover the
 * case where the row renders no button at all.
 *
 * @param actionsRow - the action row found by {@link findActionsRow}.
 * @returns the sibling's `class` attribute, or undefined when there is none.
 */
export function shippedActionClass(actionsRow: Element | null): string | undefined {
  const sibling = actionsRow?.querySelector('button')
  const className = sibling?.getAttribute('class')
  return className !== null && className !== undefined && className !== ''
    ? className
    : undefined
}