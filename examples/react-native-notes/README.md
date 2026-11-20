# trails on React Native (Expo)

A notes app on `@blazetrails/activerecord` and `expo-sqlite`, run by Expo (Metro, Hermes). It has two
models, `Notebook` (`hasMany("notes", { dependent: "destroy" })`, `name` presence) and `Note`
(`belongsTo("notebook")`, `title` presence, a `pinned` scope), two migrations, and two screens: the
notebook list and a notebook's notes.

```bash
pnpm start          # Expo dev server; open in Expo Go or a dev build
pnpm bundle         # production Android bundle (Hermes bytecode) into dist/
pnpm headless       # the models on a production Metro bundle, outside React Native (below)
pnpm typecheck      # trails-tsc --schema db/schema.ts
```

The device has no `db/migrate` to glob and no `trails db:migrate`, so `lib/database.ts` bundles each
migration class and runs them through `Migrator` at startup. `db/schema.ts` is the schema dump the
typecheck reads; nothing loads it at run time. `app/models/index.ts` sets each model as a top-level
constant, which is what Zeitwerk does in a trails app, so association class names resolve.

## What has been verified

- `pnpm bundle` produces the Android Hermes bundle (8.4 MB).
- `pnpm headless` builds a production (minified) Metro bundle of the models, migrations and
  `lib/database.ts`, using the same Babel config and resolver, with `expo-sqlite` swapped for an async
  shim over `node:sqlite`. It then runs that bundle in a V8 context that has only the globals React
  Native has: no `process`, `require`, `Buffer` or `AsyncLocalStorage`. It migrates, creates, reads
  through the association and the scope, renders a validation message, and destroys dependents.
- It has not been run on a device or simulator yet.

## What React Native needs that Node does not

Each of these was hit getting the bundle to build or run. They are worked around here, to be fixed in
trails once the demo is proven.

| #   | Breakpoint                                                                                                                                                                                                                                                            | Worked around by                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `@blazetrails/sqlite3`'s `expo-sqlite.ts` loads expo-sqlite with `createRequire(import.meta.url)` from `node:module`, so the React Native driver is the one that needs Node                                                                                           | `metro.config.js` resolves `node:module` to `shims/node-module.js`, whose `createRequire` answers `expo-sqlite`                                   |
| 2   | `encryption/config.ts` imports `zlib` at the top, which `Base` reaches with or without encryption                                                                                                                                                                     | `metro.config.js` resolves Node built-ins to an empty module                                                                                      |
| 3   | ruby-compat's platform adapters (`fs`, `crypto`, `os`, `http`, `zlib`, `child-process`, `async-context`) contain a literal `require("node:module")`. It is guarded at run time, but Metro resolves every literal `require` at build time                              | the same resolver                                                                                                                                 |
| 4   | Expo answers `import.meta.url` with the bundle URL in every module. activemodel, activerecord and activesupport each register `locale/en.js` under `new URL(..., import.meta.url)`, so the last one replaces the others and every message reads "Translation missing" | `babel/per-file-import-meta-url.js` gives each module its own file URL                                                                            |
| 5   | `namespaces.ts`'s adapter autoload map uses computed `import(new URL(...).href)`, which Metro refuses to bundle                                                                                                                                                       | `babel/computed-import-rejects.js` turns each one into a rejected promise                                                                         |
| 6   | Hermes has neither `AsyncLocalStorage` nor `AsyncContext`, so ruby-compat's fallback raises "Overlapping async context scopes are not supported…" when two queries overlap (`Promise.all([A.count(), B.count()])`)                                                    | every database call in the UI goes through `serially` (`lib/database.ts`)                                                                         |
| 7   | Hermes has no Web Crypto, so `SecureRandom` (the `Instrumenter` id taken on `establishConnection`) raises "No random device"                                                                                                                                          | `lib/polyfills.ts` installs `crypto.getRandomValues` from `expo-crypto`                                                                           |
| 8   | `SQLite3Adapter`'s constructor expands, `dirname`s and `mkdir -p`s the database path, and the schema cache path is `File.join`ed, so it needs a filesystem adapter                                                                                                    | `lib/host.ts` registers `path-browserify` over a filesystem that raises ENOENT; the database is `file:notes.db`, which skips the directory branch |
| 9   | `StatementPool` reads `Process.pid`, and there is no process adapter outside Node                                                                                                                                                                                     | `lib/host.ts` registers a single-process adapter                                                                                                  |
| 10  | `SchemaCreation#accept` (and other visitors) dispatch on `klass.name`, which a minifier mangles                                                                                                                                                                       | `metro.config.js` sets `keep_classnames` / `keep_fnames`                                                                                          |
| 11  | activesupport declares a module-scope `class Object`. Babel's ES-module-to-CommonJS output puts `Object.defineProperty(exports, ...)` at the top of the module, inside that class's TDZ                                                                               | `babel/unshadow-globals.js` renames module-scope bindings that shadow JS globals                                                                  |
| 12  | babel-preset-expo runs `flow-strip-types` over every `.js` file, which deletes a class field with no initializer (`data;`). The constructor's `this.data = …` then goes through `OrderedOptions`' prototype Proxy and recurses                                        | `babel/keep-uninitialized-fields.js` writes every non-`declare` field with no initializer as `data = void 0`                                      |
| 13  | Expo's Hermes profile lowers `static {}` blocks and block-scoped loops, and the `_loop` function it emits loses `this`, so `CommandRecorder`'s static block reads `this.StraightReversions` as undefined                                                              | `babel/static-block-this.js` writes `this` in a static block as the class binding                                                                 |
| 14  | The `file:notes.db` that row 8 needs reaches `openDatabaseAsync` unchanged, and expo-sqlite takes a file name, not a URI, so on a device the database file in expo-sqlite's directory is named `file:notes.db`                                                        | not worked around; the expo driver should strip the URI, or the adapter should skip its directory step for a driver that owns its directory       |

Rows 1–9 and 14 are trails code that assumes Node. Rows 10–13 come from the bundler, but rows 11–13 are each
triggered by a trails idiom: a global-named class, a prototype Proxy that relies on `[[Define]]` field
semantics, and `this` in a static block.

The trails rows are filed in the tasks repo: `expo-sqlite-driver-loads-expo-sqlite-through-node-module` (1),
`encryption-config-imports-node-zlib-at-load` (2), `platform-adapters-literal-require-node-module-breaks-metro` (3),
`locale-registration-keyed-on-shared-import-meta-url` (4), `adapter-autoload-map-computed-import-unbundleable` (5),
`async-context-fallback-raises-on-overlapping-scopes` (6), `secure-random-no-host-random-source-outside-node` (7),
`sqlite3-adapter-requires-fs-adapter-for-driver-owned-database` (8),
`process-adapter-required-for-process-pid-outside-node` (9) and
`expo-sqlite-driver-passes-file-uri-as-database-name` (14).
