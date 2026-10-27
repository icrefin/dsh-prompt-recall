import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AUTHOR, VERSION } from '../src/version.ts'
import { apply, inject, name } from '../src/index.ts'

describe('manifest mirror', () => {
  it('pins the version to package.json', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { version?: unknown }
    expect(VERSION).toBe(manifest.version)
  })

  it('carries the mandated author credit verbatim', () => {
    expect(AUTHOR).toBe('icrefin [icrefinai@gmail.com]')
  })
})

describe('host half', () => {
  it('declares the Loader identity the bundle patch inserts', () => {
    expect(name).toBe('dsh-prompt-recall')
  })

  it('requires no host service and mounts without side effects', () => {
    expect(inject).toEqual([])
    expect(() => {
      apply()
    }).not.toThrow()
  })
})