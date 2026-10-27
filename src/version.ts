/**
 * The one version string this package reports.
 *
 * It is hand-kept beside `package.json`'s `version` (the browser half cannot
 * read the manifest at runtime: the boot graph hands the bundle a `require`
 * table, not a filesystem). `test/host.spec.ts` fails when the two drift.
 *
 * @module dsh-prompt-recall/version
 */

/** Package version, mirrored from `package.json`. */
export const VERSION = '0.1.2'

/** Literal author credit required beside the version chip. */
export const AUTHOR = 'icrefin [icrefinai@gmail.com]'