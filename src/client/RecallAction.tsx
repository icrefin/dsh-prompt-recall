/**
 * The recall button, and the session-scoped controller that puts it where it
 * belongs.
 *
 * The controller mounts in the composer's tool row (`conversation.input.right`),
 * which is the only Conversation slot that is (a) session-scoped, (b) resident
 * for as long as the session is on screen, and (c) rendered outside the
 * transcript's own React tree. From there it does two things no slot can do for
 * it:
 *
 * 1. **places a button into the shipped action row of the newest prompt** —
 *    `anchor.ts` explains why that row is addressed by DOM instead of by slot;
 * 2. **drains a staged draft** into the composer when this session is the child
 *    of a recall that just ran (`staging.ts`).
 *
 * Everything else — deciding whether a prompt is recallable, stopping the turn,
 * forking — is resolved at click time through the injected face, so the button
 * never acts on a stale render.
 *
 * @module dsh-prompt-recall/client/RecallAction
 */

import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { IconRefreshOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  OWNED_ATTR,
  conversationRoot,
  findActionsRow,
  shippedActionClass,
} from './anchor.ts'
import type { RecallOutcome } from './recall.ts'
import { RESTORE_WINDOW_MS, releaseDraft, stagedDraft } from './staging.ts'
import type { RecallPlan } from './window.ts'

/** Locale namespace this plugin owns. */
export const NS = 'dsh-prompt-recall'

/** The composer tool-row seat the controller occupies. */
export const SLOT = 'conversation.input.right'

/** List-slot entry identity; also the key a user patch would target. */
export const ENTRY_ID = 'prompt-recall'

/** Read-only share of the Session input machine this component needs. */
export interface InputStateLike {
  /** Clipboard-text projection of the composer's draft. */
  readonly draft: string
}

/** Selector hook over the Session's input machine (the standard `useInput` seat). */
export type UseInput = <Selected>(select: (state: InputStateLike) => Selected) => Selected

/** Public input actions for this Session (the standard `inputActions` seat). */
export interface InputActionsLike {
  /** Replace the whole draft. */
  setDraft(text: string): void
}

/** Props injected through the entry's `inject` face. */
export interface RecallInjected {
  /** Session this composer seat belongs to. */
  readonly sessionId: string
  /**
   * Whether this session may be rewound at all — false for a subagent session,
   * whose transcript is its parent's evidence rather than a conversation.
   */
  readonly available: () => boolean
  /** Resolve the recall plan against the live event window. */
  readonly planNow: () => RecallPlan | null
  /** Run one recall gesture. */
  readonly recall: (plan: RecallPlan) => Promise<RecallOutcome>
  /** Move keyboard focus into the composer, when the shell allows it. */
  readonly focusComposer: (() => void) | undefined
  /** Surface a failure in this session's own composer. */
  readonly notify: (level: 'info' | 'error', text: string) => void
}

/** Full props of the controller entry. */
export interface RecallActionProps extends RecallInjected {
  /** Locale seat, present because the registration declares `locale: NS`. */
  readonly t: TranslateNS<typeof NS>
  /** Standard session seat. */
  readonly useInput: UseInput
  /** Standard session seat. */
  readonly inputActions: InputActionsLike
}

/** The controller renders its marker inline and the button through a portal. */
const MARKER_STYLE = { display: 'none' } as const

/**
 * Mount the recall controller.
 *
 * @param props - injected face plus the two standard session seats.
 * @returns the hidden composer marker and, when a prompt row is on screen, the
 *   portalled action button.
 */
export function RecallAction(props: RecallActionProps): ReactElement {
  const { sessionId, t, useInput, inputActions, focusComposer, notify } = props
  const draft = useInput((state) => state.draft)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const markerRef = useRef<HTMLSpanElement | null>(null)
  const [anchor, setAnchor] = useState<Element | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  // Drain a staged draft: applied only while the composer is still empty, so a
  // user who starts typing during the hand-off keeps what they typed. The loop
  // exists because the shell binds the Lexical editor asynchronously; every exit
  // that did not apply the text tells the user instead of dropping it silently.
  useEffect(() => {
    let frame = 0
    const deadline = Date.now() + RESTORE_WINDOW_MS
    const giveUp = (text: string): void => {
      releaseDraft(sessionId, text)
      notify('error', t('error.restore'))
    }
    const step = (): void => {
      frame = 0
      const text = stagedDraft(sessionId)
      if (text === undefined) return
      if (draftRef.current === text) {
        releaseDraft(sessionId, text)
        focusComposer?.()
        return
      }
      if (draftRef.current !== '' || Date.now() > deadline) {
        giveUp(text)
        return
      }
      try {
        inputActions.setDraft(text)
      } catch (error) {
        console.warn('[dsh-prompt-recall] the recalled prompt could not be restored', error)
        giveUp(text)
        return
      }
      frame = requestAnimationFrame(step)
    }
    step()
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [sessionId, inputActions, focusComposer, notify, t])

  // Track the newest prompt's action row. A MutationObserver rather than a
  // render-time read, because the row is rendered by another React root: our
  // own commit order relative to the Chat transcript's is not defined.
  useEffect(() => {
    const root = conversationRoot(markerRef.current, sessionId)
    if (root === null) {
      setAnchor(null)
      return
    }
    let frame = 0
    const sync = (): void => {
      frame = 0
      setAnchor((current) => {
        const next = findActionsRow(root)
        return next === current ? current : next
      })
    }
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(sync)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    })
    schedule()
    return () => {
      observer.disconnect()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [sessionId])

  const onClick = useCallback((): void => {
    if (busyRef.current) return
    const plan = props.planNow()
    if (plan === null) {
      props.notify('error', t('error.noPrompt'))
      return
    }
    busyRef.current = true
    setBusy(true)
    void props
      .recall(plan)
      .catch((error: unknown) => {
        console.warn('[dsh-prompt-recall] the prompt could not be recalled', error)
        props.notify('error', t('error.failed'))
      })
      .finally(() => {
        busyRef.current = false
        setBusy(false)
      })
  }, [props, t])

  let button: ReactNode = null
  if (anchor !== null && props.available()) {
    const label = busy ? t('recall.busy') : t('recall')
    button = createPortal(
      <Tooltip label={label} side="bottom">
        <button
          type="button"
          className={shippedActionClass(anchor)}
          aria-label={label}
          aria-disabled={busy || undefined}
          data-unavailable={busy || undefined}
          onClick={onClick}
          {...{ [OWNED_ATTR]: '' }}
        >
          <IconRefreshOutlineRegular />
        </button>
      </Tooltip>,
      anchor,
    )
  }

  return (
    <>
      <span ref={markerRef} style={MARKER_STYLE} />
      {button}
    </>
  )
}