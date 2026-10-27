// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { ACTION_CSS, installStyles } from '../src/client/styles.ts'

/** Attribute pair every tag this plugin installs carries. */
const SELECTOR = 'style[data-plugin="dsh-prompt-recall"]'

describe('installStyles', () => {
  beforeEach(() => {
    for (const tag of document.querySelectorAll(SELECTOR)) tag.remove()
  })

  it('installs exactly one claimed tag', () => {
    installStyles(document)
    installStyles(document)
    expect(document.querySelectorAll(SELECTOR).length).toBe(1)
  })

  it('scopes the fallback to buttons that copied no class', () => {
    // The shipped action class is copied at runtime; the plugin's own rules must
    // not compete with it in the cascade.
    expect(ACTION_CSS).toContain('[data-dsh-prompt-recall]:not([class])')
  })

  it('never declares a literal colour', () => {
    // Style contract: `--dsw-alias-*` tokens only, and the sole permitted hex is
    // a neutral fallback inside a var().
    const literals = ACTION_CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(literals).toEqual([])
  })

  it('removes only the tag its own call created', () => {
    const dispose = installStyles(document)
    expect(document.querySelectorAll(SELECTOR).length).toBe(1)
    dispose()
    expect(document.querySelectorAll(SELECTOR).length).toBe(0)

    // A second caller found an existing tag, so its disposer is a no-op.
    installStyles(document)
    const noop = installStyles(document)
    noop()
    expect(document.querySelectorAll(SELECTOR).length).toBe(1)
  })

  it('tolerates a missing document', () => {
    expect(() => installStyles(undefined)).not.toThrow()
  })
})