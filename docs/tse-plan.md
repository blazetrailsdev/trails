# TSE — Trails Server Embedded templates

All implementation stories are complete. This doc tracks remaining
follow-ups. For design reference (ERB internals, TSE architecture,
API mapping tables), see git history.

## Completed work

### Infrastructure phases

| Phase | Title                                          | PR(s)               |
| ----- | ---------------------------------------------- | ------------------- |
| 0a    | Extract trails-tsc                             | #1943               |
| 0b    | SafeString / OutputBuffer                      | #1941               |
| 2a-0  | tse-compiler package (lexer, AST, emitters)    | #2190               |
| 2a-1  | Tse handler class                              | #2200               |
| 2b    | tse plugin (virtualization + manifest)         | #2201               |
| 2c    | Build CLI + watch + TS language service plugin | #2222, #2223, #2232 |

### Fidelity stories

| Story | Title                                                      | PR    |
| ----- | ---------------------------------------------------------- | ----- |
| 5.1   | Handler: annotate-rendered-view-with-filenames             | #2366 |
| 5.2   | Compiler: BLOCK_EXPR no-paren-wrap                         | #2364 |
| 5.3   | Strict locals: emit + enforce signature                    | #2368 |
| 5.4   | OutputBuffer: Rails-faithful shape + method names          | #2363 |
| 5.5   | Filename parsing: token-set format resolution + override   | #2373 |
| 5.6   | RenderContext: capture / concat / raw + block-form helpers | #2367 |
| 5.7   | Layouts and yield                                          | #2369 |
| 5.8   | Partials: typed render overloads + collection/as/counter   | #2370 |
| 5.9   | Artifact emission: .js.map, .d.ts, .d.ts.map               | #2382 |
| 5.10  | Ambient `declare module "*.tse"`                           | #2374 |
| 5.11  | Emitter hygiene CI guard                                   | #2383 |
| 5.12  | TemplateRegistry augmentation + typed render overload      | #2365 |
| 5.13  | Package wiring: exports, tsconfig, prepare hook            | #2377 |
| 5.14  | Post-merge follow-up bundle                                | #2375 |

## Post-merge follow-ups

Collected from post-merge findings across all story PRs. Grouped by area.

**Type safety / DX sharpening**

- [ ] ~30 LOC (#2370): render overload fallback gap — `render({ partial: "users/user" })` with required locals silently falls back to the dynamic `DynamicPartialOptions` overload. Fix: single conditional-generic signature (`P extends string` → `P extends keyof TemplateRegistry ? … : …`).
- [ ] ~20 LOC (#2370): collection `locals` type does not `Omit` auto-injected keys (`[localName]`, `[localName]_counter`, `[localName]_iteration`). Type is looser than ideal; behavior is correct.
- [ ] ~50 LOC (#2365): semantic diagnosis tests for render conditional generic — required locals for known partials, optional when `{} extends LocalsType`, wrong-shape rejection. Currently string-match only.
- [ ] ~30 LOC (#2365): multi-format intersection type (same partial as `.html.tse` + `.json.tse`) needs a `buildViews` integration test.

**Rails fidelity**

- [ ] ~3 LOC (#2375): `TseRenderContextImpl.raw()` short-circuits on `SafeBuffer` inputs — Rails `raw()` always calls `.to_s.html_safe`. Remove the short-circuit, keep only the OutputBuffer guard. File: `packages/actionview/src/render-context.ts`.

**Build tooling**

- [ ] ~30 LOC (#2382): multi-line `<% %>` code tags only map the first generated line in `.tse.js.map`. Fix: emit one mapping per output line. Requires column-level spans in lexer tokens first.
- [ ] ~15 LOC (#2382): `emitDeclarations()` in `build-views.ts` ignores `program.emit()` return value — `throw` on `emitSkipped` for fail-fast.
- [ ] ~10 LOC (#2382): `lineAt()` in lexer is O(n) per call (O(n²) total). Replace with precomputed line-start index + binary search if templates grow large.
- [ ] ~30 LOC (#2377): `trails-tsc-views build` should emit `.tse.d.ts` alongside `.tse.js` so exports `types` condition points at declaration files instead of `.tse.ts` source shims.
- [ ] ~5 LOC (#2377): `./lsp` and `./ts-plugin` exports on `@blazetrails/trails-tsc` are duplicates. Deprecate and remove `./lsp` once downstream migrates.

**Sync / maintenance**

- [ ] Virtualizer inline `RenderContext` interface (in `tse.ts` `buildPreamble`) must stay in sync with `TseRenderContext` in `render-context.ts` manually. No automated check exists yet.
