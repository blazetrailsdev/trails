# DX type tests

Type-level tests for `@blazetrails/activerecord` that exercise the public
API the way a Rails developer would use it. They answer: **can someone
build a Rails app on top of this with good autocomplete and type safety?**

These are NOT runtime tests. They use Vitest's typecheck mode (`*.test-d.ts`)
with `expectTypeOf` / `assertType`. Failures here mean the published types
lie to users.

Run locally:

```bash
pnpm test:types
```

CI runs the same command in a dedicated `DX Type Tests` job. No pre-build
is required — the dx-tests `tsconfig.json` uses path aliases to resolve
`@blazetrails/*` imports straight to `src/`.

## Files

Each file represents a real-world usage scenario:

- `basic-crud.test-d.ts` — defining a model, creating, reading, updating,
  destroying, serializing.
- `associations.test-d.ts` — `belongsTo` / `hasMany` / `hasOne` shapes
  using the canonical Rails-guides blog domain (Author / Post / Comment /
  Profile).
- `query-chaining.test-d.ts` — `where` / `findBy` / ordinal finders /
  thenable chains on `Relation<T>`.
- `edge-cases.test-d.ts` — composite keys, enums, scopes, validators,
  permissive attribute bags.

## Gap-tracking pattern

Some tests are marked `KNOWN GAP:` and assert the current (weaker) shape.
When the implementation tightens (e.g. `Post.where(...)` starts returning
`Relation<Post>` instead of `any`), the corresponding assertion flips and
fails — that's the signal to update the test and promote the assertion.
