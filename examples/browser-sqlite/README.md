# trails in the browser, on SQLite

A trails application that runs entirely in a browser tab, on SQLite compiled to WebAssembly
(sql.js). The page is an editor: a file tree and editor over the app's source, a preview where
trails serves the app's pages, and a console showing the app's output, the Rails log included.
Edit a file and the app restarts with the change.

```bash
pnpm dev     # Vite dev server; open the printed URL
pnpm smoke   # headless Chromium: boot, create a post through the form, edit a view, restart
```

The app (`template/`) is an ordinary trails app: `config/application.ts`, `config/routes.ts`
(`resources("posts")`), a `PostsController` with `index` / `show` / `create` / `destroy`, a `Post`
model with a presence validation, a layout and `.tse` views, and one migration. It boots through
`Trails.initialize()`, autoloads through Zeitwerk, migrates through `MigrationContext`, and
answers requests through `Trails.application.call`, as it would under Node.

## How it fits together

| Piece                                                  | What it does                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Editor (`index.html`, `src/host/`)                     | Holds the files and the database bytes (both kept in `localStorage`), and recreates the runtime iframe on every restart, so each run evaluates a fresh module graph                                                                                    |
| Runtime iframe (`runtime.html`, `src/runtime/main.ts`) | Loads the framework packages, registers the browser host adapters, boots the app, runs pending migrations, and answers requests                                                                                                                        |
| Virtual filesystem (`src/runtime/vfs.ts`)              | An in-memory ruby-compat `FsAdapter`. Zeitwerk, the template resolver and the migrator read the app's files from it; the app's `log/development.log` is written to it and tailed into the console                                                      |
| Service worker (`public/sw.js`)                        | Sends the preview's `/preview/*` requests to the runtime, which hands them to the Rack app with `SCRIPT_NAME=/preview`, and serves the app's modules: `pathToFileURL("/app/models/post.ts")` is a `/rt/<run>/vfs/...` URL the worker answers           |
| Module loading (`src/runtime/modules.ts`)              | Transpiles an app file with TypeScript's `transpileModule`, and points its `@blazetrails/*` imports at shims that `export *` from the URL the dev server serves each package at, so app code shares the framework's module instances and live bindings |
| Templates (`src/runtime/template-compiler.ts`)         | A trails app precompiles `.tse` with `trails-tsc-views build`; here the source is in the editor, so `setTemplateCompiler` builds the same stand-in module from it at first render                                                                      |
| SQLite (`src/runtime/expo-sqlite-sqljs.ts`)            | The app's `database.ts` says `adapter: "expo-sqlite"`; the runtime answers expo-sqlite's async API with sql.js, so the stock `SQLite3Adapter` runs unchanged                                                                                           |

## What a browser needs that Node does not

`config/application.ts` sets no `secretKeyBase`: in development trails generates
`tmp/local_secret.txt`, as Rails does, and the editor keeps `tmp/` across restarts.

Each was hit booting this app in Chromium, and each is handled in this example rather than in
trails:

| Breakpoint                                                                                                                                                                                                                                                                        | Handled by                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| No filesystem, process, OS or YAML backend                                                                                                                                                                                                                                        | `src/runtime/host.ts` registers a VFS, a single-process adapter, an OS adapter, and the npm `yaml` package as Psych's backend             |
| Web Crypto is async-only, but `KeyGenerator`'s `pbkdf2Sync` and the cookie jar's AES-256-GCM are synchronous                                                                                                                                                                      | `src/runtime/crypto.ts`, a crypto adapter on `@noble/hashes` and `@noble/ciphers`                                                         |
| Packages import Node built-ins at module scope (`zlib` in encryption, `net` and nodemailer in `mail`)                                                                                                                                                                             | `vite.config.ts` gives each built-in a module with the same export names that throws only when called; nodemailer's SMTP client is a stub |
| `@blazetrails/sqlite3` reaches expo-sqlite through `createRequire(import.meta.url)` and, in its engine, a computed `import()`                                                                                                                                                     | the `node:module` shim's `createRequire`, and `runtime.html`'s import map                                                                 |
| `Buffer` and `Temporal` are not browser globals                                                                                                                                                                                                                                   | the `buffer` and `@js-temporal/polyfill` packages, installed before anything loads                                                        |
| A response a service worker builds cannot set a cookie, and a page cannot send `Cookie` through `fetch`, so the session and CSRF token are lost                                                                                                                                   | `src/runtime/cookie-jar.ts` keeps the preview's cookies and passes them as `HTTP_COOKIE`                                                  |
| The browser has no `AsyncLocalStorage`, so two overlapping requests share one execution context                                                                                                                                                                                   | the runtime handles one request at a time                                                                                                 |
| A static production build: Rollup either reorders trails' import cycles into a TDZ (merged chunks), evaluates lazily imported modules eagerly (native `better-sqlite3`), or drops a module's self-namespace import (`import * as I18n from "./index.js"`, with `preserveModules`) | not handled: the example runs on the Vite dev server, whose native ES modules evaluate trails in the same order Node does                 |
