/**
 * Typed surface of the browser bootstrap's static module table.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is not a plugin bundle: it is one of
 * the eight modules the web bootstrap itself hands every client factory
 * (`react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`,
 * `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`,
 * `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`,
 * `@deepseek-ai/dsh-client-ui-dockkit`). It is therefore never on disk next to
 * a plugin, and a plugin cannot type-import it from `node_modules`.
 *
 * So the two members this plugin uses are declared here, narrowed to the
 * runtime contract the shipped Chat action row relies on as well. Declaring
 * more than is used would be a promise this file cannot keep; declaring less
 * is impossible, and both members are asserted at runtime before first use.
 *
 * @module dsh-prompt-recall/client/primitives
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement, ReactNode } from 'react'

  /** Properties of one outline icon artwork. */
  export interface IconProps {
    /** Square edge in pixels; the shipped action row overrides it with CSS. */
    readonly size?: number
    /** Extra class names. */
    readonly className?: string
    /** Stroke width in pixels. */
    readonly strokeWidth?: number
  }

  /** Tooltip that clones its single child to anchor a floating label. */
  export function Tooltip(props: {
    /** Label text, or a thunk for a live label. */
    readonly label: string | (() => string)
    /** Preferred side; the shipped icon rows use `bottom`. */
    readonly side?: 'top' | 'right' | 'bottom' | 'left'
    /** Alignment along the anchor edge. */
    readonly align?: 'start' | 'center' | 'end'
    /** Hover delay in milliseconds. */
    readonly delayMs?: number
    /** Focus delay in milliseconds. */
    readonly focusDelayMs?: number
    /** Distance from the anchor in pixels. */
    readonly gap?: number
    /** While true only the child renders. */
    readonly disabled?: boolean
    /** Render the bubble in a document-level portal. */
    readonly portal?: boolean
    /** Maximum bubble width. */
    readonly maxWidth?: number
    /** The single element the bubble anchors to. */
    readonly children: ReactElement
  }): ReactNode

  /** Counter-clockwise circular arrow, the "send it again" glyph. */
  export function IconRefreshOutlineRegular(props: IconProps): ReactElement
}