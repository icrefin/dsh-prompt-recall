/**
 * dsh-prompt-recall — browser half.
 *
 * One slot entry, on the composer's tool row (`conversation.input.right`). The
 * entry renders nothing visible there: it is a *controller* that owns a button
 * placed into the newest prompt's shipped action row, beside copy and branch.
 * `RecallAction.tsx` explains the placement; `window.ts` explains how the
 * prompt and the rewind boundary are read out of the session's own event
 * window; `recall.ts` explains why the gesture is a fork.
 *
 * Every runtime binding the controller needs is closed over here rather than
 * looked up inside the component, because a client `inject` face is cached per
 * entry × session binding: the component then holds stable functions and no
 * service lookups of its own.
 *
 * A client `apply` that throws takes the whole shell boot down with it — the
 * loader fails the boot when a plugin's `apply` throws — so the body is wrapped
 * and every failure degrades to "no recall button".
 *
 * @module dsh-prompt-recall/client
 */

import type { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  ENTRY_ID,
  NS,
  RecallAction,
  SLOT,
  type InputActionsLike,
  type RecallInjected,
} from './RecallAction.tsx'
import { en, zh } from './locales.ts'
import { performRecall, type RecallPorts } from './recall.ts'
import { stageDraft } from './staging.ts'
import { installStyles } from './styles.ts'
import { planRecall, type RecallPlan, type SessionEventWindow } from './window.ts'

export { NS } from './RecallAction.tsx'

/** Services this plugin needs from the client root context. */
export const inject = ['slots', 'locale', 'sessions']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Keys of this plugin's own dictionary. */
    'dsh-prompt-recall': keyof typeof en
  }
}

/** Structural face of the client locale service. */
interface LocaleService {
  register(namespace: string, dictionaries: { en: typeof en; zh: typeof zh }): () => void
  /**
   * Bind the namespace to a translate function. The binding is live: it reads
   * the active locale at call time, so a face built once still follows a locale
   * switch.
   */
  bind(namespace: string): (key: string) => string
}

/** Structural face of the client slot service. */
interface SlotsService {
  readonly register: SlotCore['register']
  /**
   * Run `callback` once the named slot is declared.
   * @param key - slot key to wait for.
   * @param callback - registration body.
   * @returns the declaration subscription's disposer.
   */
  inject(key: string, callback: () => () => void): () => void
}

/** One session's event-window source (a bare observable, never a hook). */
interface EventSource {
  getSnapshot(): SessionEventWindow
  subscribe(listener: () => void): () => void
}

/** One materialized session binding, as far as this plugin reads it. */
interface SessionBindingLike {
  readonly eventSource: EventSource
}

/** A session-scoped client context (the sessions service's `scope()` result). */
interface AgentScopeLike {
  get<T = unknown>(name: string): T | undefined
}

/** The facade a session-scope Conversation service hands out for its own scope. */
interface SessionInputFace {
  /** Replace the whole draft of that scope's composer. */
  setDraft(text: string): void
  /** Return the keyboard to that scope's composer. */
  focus(): void
  /** Surface a notice in that scope's composer. */
  notify(level: 'info' | 'error', text: string): void
}

/** Conversation service read through a session scope. */
interface ScopedConversation {
  /** Cancel the scoped session's in-flight turn. */
  cancel(): Promise<void>
  /** Per-session input facade registry. */
  readonly input: { for(scope: unknown): SessionInputFace }
}

/** The `ctx.sessions` wire face this plugin uses. */
interface SessionsService {
  binding(id: string): SessionBindingLike | undefined
  scope(id: string): AgentScopeLike | undefined
  fork(opts: { sessionId: string; atSeq: number; increaseTitle?: boolean }): Promise<string>
  create(opts?: { cwd?: string; sessionId?: string }): Promise<string>
  /**
   * Non-undefined for an addressed subagent session. Optional so a client that
   * does not publish it degrades to "recall is offered" rather than throwing in
   * a renderer.
   */
  subagentAddress?(id: string): unknown
  readonly list: {
    getSnapshot(): { readonly byId: Record<string, { readonly cwd?: string } | undefined> }
  }
}

/** The `ctx.uiWorkspace` face this plugin uses. */
interface WorkspaceService {
  openSession(sessionId: string): void
  /**
   * Retire one session into the durable archive set; `stopActivity` also asks
   * whatever is running in it to stop. Clears the main panel if the archived
   * session is the one on screen.
   */
  archiveSession(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<void>
}

/** Structural face of the client root context this plugin uses. */
interface ClientContext {
  effect(callback: () => (() => void) | void, label?: string): void
  inject(services: string[], callback: (scope: ClientScope) => void): void
  get<T = unknown>(name: string): T | undefined
  slots: SlotsService
  locale: LocaleService
  sessions: SessionsService
}

/** The context handed to `ctx.inject`, with the requested services bound. */
interface ClientScope {
  effect(callback: () => (() => void) | void, label?: string): void
  slots: SlotsService
}

/** Everything one session's recall gesture needs, resolved from the root context. */
interface RecallRuntime {
  readonly ctx: ClientContext
  readonly sessionId: string
}

/** Read one session's Conversation service through its own scope. */
function scopedConversation(
  ctx: ClientContext,
  sessionId: string,
): { scope: AgentScopeLike; conversation: ScopedConversation } | undefined {
  const scope = ctx.sessions.scope(sessionId)
  if (scope === undefined) return undefined
  const conversation = scope.get<ScopedConversation>('conversation')
  if (conversation === undefined) return undefined
  return { scope, conversation }
}

/** Read the recall plan from the session's live event window. */
function planFor(runtime: RecallRuntime): RecallPlan | null {
  const binding = runtime.ctx.sessions.binding(runtime.sessionId)
  if (binding === undefined) return null
  return planRecall(binding.eventSource.getSnapshot())
}

/**
 * Surface a notice in one session's own composer.
 *
 * Session-routed on purpose: after the gesture the user is looking at the
 * child, but the notice belongs to whichever session it describes, and the
 * facade lands it on that session's composer rather than the current one.
 */
function notifySession(
  ctx: ClientContext,
  sessionId: string,
  level: 'info' | 'error',
  text: string,
): void {
  try {
    const scoped = scopedConversation(ctx, sessionId)
    if (scoped === undefined) return
    scoped.conversation.input.for(scoped.scope).notify(level, text)
  } catch (error) {
    console.warn('[dsh-prompt-recall] the composer could not show a notice', error)
  }
}

/** Runtime ports behind one recall gesture. */
function portsFor(runtime: RecallRuntime, messages: { archiveFailed: string }): RecallPorts {
  const { ctx } = runtime
  return {
    cancel: async (id) => {
      await scopedConversation(ctx, id)?.conversation.cancel()
    },
    fork: (id, atSeq) => ctx.sessions.fork({ sessionId: id, atSeq, increaseTitle: true }),
    create: async (id) => {
      // The prompt was the session's first event, so there is no prefix to fork:
      // the conversation restarts in the same working directory instead.
      const cwd = ctx.sessions.list.getSnapshot().byId[id]?.cwd
      return await ctx.sessions.create(cwd === undefined ? {} : { cwd })
    },
    restore: (childId, text) => {
      stageDraft(childId, text)
    },
    open: (childId) => {
      ctx.get<WorkspaceService>('uiWorkspace')?.openSession(childId)
    },
    archive: async (id) => {
      // `stopActivity` is the same escalation the shipped confirmation offers:
      // recall has already decided the session is done, and the archive set is
      // what blocks a later wake from re-running the withdrawn prompt.
      await ctx.get<WorkspaceService>('uiWorkspace')?.archiveSession(id, { stopActivity: true })
    },
    reportArchiveFailure: (childId) => {
      notifySession(ctx, childId, 'error', messages.archiveFailed)
    },
  }
}

/**
 * Whether this session may be rewound.
 *
 * A subagent session is the parent's evidence, not a conversation: forking it
 * would mint an ordinary session out of a subagent prefix, and retiring it
 * would remove it from its parent's catalog. Recall is not offered there.
 *
 * @param ctx - client root context.
 * @param sessionId - the session owning the composer seat.
 * @returns true when the session is an ordinary, user-facing conversation.
 */
function recallable(ctx: ClientContext, sessionId: string): boolean {
  return ctx.sessions.subagentAddress?.(sessionId) === undefined
}

/**
 * Build the inject face for one composer seat.
 *
 * **Nothing in here may throw.** The factory runs inside the renderer, and a
 * throw there retires the entry for the rest of the page's life. Every step is
 * guarded, and a failure degrades to "this session has no recall button".
 *
 * @param ctx - client root context.
 * @param sessionId - the session owning the composer seat.
 * @param t - the session's locale seat, for the two failure notices.
 * @returns the props the controller entry receives.
 */
function faceFor(
  ctx: ClientContext,
  sessionId: string,
  t: (key: 'error.noPrompt' | 'error.failed' | 'error.restore' | 'error.archive') => string,
): RecallInjected {
  const runtime: RecallRuntime = { ctx, sessionId }
  return {
    sessionId,
    available: () => {
      try {
        return recallable(ctx, sessionId)
      } catch (error) {
        console.warn('[dsh-prompt-recall] the session kind could not be read', error)
        return false
      }
    },
    planNow: () => {
      try {
        return planFor(runtime)
      } catch (error) {
        console.warn('[dsh-prompt-recall] the session window could not be read', error)
        return null
      }
    },
    recall: (plan) => performRecall(portsFor(runtime, { archiveFailed: t('error.archive') }), sessionId, plan),
    focusComposer: () => {
      try {
        const scoped = scopedConversation(ctx, sessionId)
        if (scoped === undefined) return
        scoped.conversation.input.for(scoped.scope).focus()
      } catch (error) {
        console.warn('[dsh-prompt-recall] the composer could not be focused', error)
      }
    },
    notify: (level, text) => {
      notifySession(ctx, sessionId, level, text)
    },
  }
}

/**
 * Register the dictionaries and the composer action.
 *
 * @param ctx - client root context carrying the slot and locale services.
 */
export function apply(ctx: ClientContext): void {
  try {
    ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-prompt-recall: dictionaries')
    ctx.effect(() => installStyles(), 'dsh-prompt-recall: action styles')
    // One live binding for the whole plugin: the controller gets its copy from
    // the entry's own `t` seat, while the gesture's two out-of-band notices (a
    // failed archive, reported on the child) need a translate function that is
    // not tied to a rendered component.
    const t = ctx.locale.bind(NS)
    ctx.inject(['slots'], (scope) => {
      scope.effect(
        () =>
          scope.slots.inject(SLOT, () => {
            try {
              return scope.slots.register(
                {
                  name: SLOT,
                  id: ENTRY_ID,
                  locale: NS,
                  // The frame caches injected props per session binding, so the
                  // seat is handed one already-bound face per session and does
                  // no service lookup of its own while rendering.
                  inject: (sessionId: string) => faceFor(ctx, sessionId, t),
                },
                RecallAction,
              )
            } catch (error) {
              // Another occupant already holds this id in this list slot: keep
              // the shipped composer rather than breaking its own registration.
              console.warn('[dsh-prompt-recall] the recall action could not be registered', error)
              return () => {}
            }
          }),
        'dsh-prompt-recall: composer action',
      )
    })
  } catch (error) {
    console.warn('[dsh-prompt-recall] the recall action could not mount', error)
  }
}

// Materialization runs this: the client module system claims a style tag created
// from the bundle's factory body and removes it again when the plugin unloads.
installStyles()

/** Re-exported so the typed `inputActions` seat can be asserted in tests. */
export type { InputActionsLike }