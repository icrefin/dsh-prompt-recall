/**
 * The button's own rules.
 *
 * These are a **fallback**, not the design. The shipped action row renders its
 * buttons through a CSS-module class whose name is a build artifact, and
 * `anchor.ts` copies that class from a live sibling so the recall button is
 * styled by the same rule the copy and branch buttons are. The rules below are
 * selected only when no sibling class could be copied (`:not([class])`), and
 * they replicate the shipped `.action` treatment token for token: a 28px square,
 * `--dsw-radius-sm`, tertiary label colour, the shared hover fill, and a 15px
 * glyph — all of it scaled by the composer's own font delta.
 *
 * Colour comes from `--dsw-alias-*` tokens only, so both themes are covered by
 * one declaration and no dark-mode override is needed.
 *
 * @module dsh-prompt-recall/client/styles
 */

/** Marker attributes the client module system uses to claim and evict the tag. */
const PLUGIN_ID = 'dsh-prompt-recall'
const TAG_ID = `${PLUGIN_ID}/action.css`

/** Rule text, hoisted so the installer and its tests share one source. */
export const ACTION_CSS = [
  '[data-dsh-prompt-recall]:not([class]){',
  'width:calc(28px + var(--dsh-content-font-delta,0px));',
  'height:calc(28px + var(--dsh-content-font-delta,0px));',
  'border-radius:var(--dsw-radius-sm);',
  'color:var(--dsw-alias-label-tertiary);',
  'cursor:pointer;',
  'background:0 0;',
  'border:none;',
  'justify-content:center;',
  'align-items:center;',
  'padding:6px;',
  'display:inline-flex}',
  '[data-dsh-prompt-recall]:not([class]) svg{',
  'width:calc(15px + var(--dsh-content-font-delta,0px));',
  'height:calc(15px + var(--dsh-content-font-delta,0px));',
  'display:block}',
  '[data-dsh-prompt-recall]:not([class]):hover{',
  'background:var(--dsw-alias-interactive-bg-hover);',
  'color:var(--dsw-alias-label-secondary)}',
  '[data-dsh-prompt-recall][data-unavailable]{cursor:default;opacity:.4}',
  '[data-dsh-prompt-recall][data-unavailable]:hover{',
  'color:var(--dsw-alias-label-tertiary);',
  'background:0 0}',
].join('')

/**
 * Ensure this plugin's style tag exists.
 *
 * Safe to call more than once and from module scope: a second call finds the
 * tag by its claim attributes and leaves it alone. A failure to reach the
 * document (a non-DOM test environment) is not an error — the button then
 * renders with the copied sibling class, or unstyled.
 *
 * @param target - document to install into.
 * @returns a disposer that removes the tag this call created, if any.
 */
export function installStyles(target: Document | undefined = globalThis.document): () => void {
  if (target === undefined) return () => {}
  const selector = `style[data-plugin=${JSON.stringify(PLUGIN_ID)}][data-plugin-css=${JSON.stringify(TAG_ID)}]`
  if (target.querySelector(selector) !== null) return () => {}
  const tag = target.createElement('style')
  tag.dataset['plugin'] = PLUGIN_ID
  tag.dataset['pluginCss'] = TAG_ID
  tag.textContent = ACTION_CSS
  target.head.appendChild(tag)
  return () => {
    tag.remove()
  }
}