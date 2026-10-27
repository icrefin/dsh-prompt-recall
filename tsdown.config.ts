import type { UserConfig } from 'tsdown'

/**
 * Browser-half bundler: emits `lib/client.js` in the module loader's factory
 * form. The `id` in the banner MUST equal the package name — it is the boot
 * graph row id, and a mismatch makes the module system reject the bundle with
 * "loaded without registering <id>".
 *
 * `react`, `react/jsx-runtime` and `react-dom` are platform seeds in the
 * browser module table (every shipped client bundle that portals a menu
 * requires the last one), so they stay externals: bundling a second React DOM
 * would break hooks and portals silently. `@deepseek-ai/dsh-client-ui-primitives`
 * is a platform seed too — it is the bootstrap's own static module, not a
 * plugin bundle — so the icon, the tooltip and their styles come from the exact
 * instances the shipped action row already uses. Everything else the client
 * imports is bundled in.
 */
export default {
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-prompt-recall", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
} satisfies UserConfig