/**
 * dsh-prompt-recall — host half.
 *
 * The plugin owns no Host state and no Host route. Everything it does is one
 * user gesture in the browser, assembled from Remote calls the Client already
 * holds a session-authorized binding for:
 *
 *   stop      the session scope's `conversation.cancel()` — the operation the
 *             composer's Stop button runs;
 *   rewind    `ctx.sessions.fork({ sessionId, atSeq })` — the Session
 *             Controller's exact-prefix fork, i.e. the operation the shipped
 *             "branch" action uses;
 *   restore   the child Scope's input facade, `setDraft()`.
 *
 * Inventing a Host half for those would mean re-implementing fork, cancellation
 * and session retention behind a second Remote surface — more code and more
 * failure modes than the Client already has. So this half exists only to be the
 * Loader row's host entry point: `dsh.bundle.patch` inserts a bare plugin by
 * package name, and `apply` is what makes that row loadable.
 *
 * @module dsh-prompt-recall
 */

import { VERSION } from './version.ts'

/** Loader row id; mirrors `cordis.patch.yml`. */
export const name = 'dsh-prompt-recall'

/** The plugin reads no Host service. */
export const inject = []

export { VERSION }

/**
 * Mount the Host half.
 *
 * Intentionally inert — see the module doc for why the work is Client-side.
 */
export function apply(): void {
  // No Host registration: every operation this plugin performs is a Remote
  // call the browser half already addresses through its own session scope.
}