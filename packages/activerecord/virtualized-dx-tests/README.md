# Virtualized DX type tests

Parallel to `../dx-tests/` but authored in the **zero-declare / zero-import**
form. Model classes are written as pure Rails-style static blocks:

```ts
class Post extends Base {
  static {
    this.attribute("title", "string");
    this.belongsTo("author");
  }
}
```

No `declare` fields, no `import type { Author }` — `trails-tsc` injects both
at compile time. Plain `tsc` will fail to compile these files; that's the
whole point of the virtualizer.

Run locally:

```bash
pnpm test:types:virtualized
```

The script builds `@blazetrails/activerecord` first (incremental, fast
after the first run) so `trails-tsc`'s compiled binary is present
before it's invoked. CI runs the same command in the `Virtualized DX
Type Tests` job.

## How auto-import is exercised

`Comment` lives in `comment.ts` and is deliberately NOT imported by
the test fixture. `Author.hasMany("comments")` in
`virtualized-patterns.test-d.ts` forces the virtualizer to inject
`import type { Comment } from "./comment.js"` so the injected
`declare comments: AssociationProxy<Comment>` — and the
`expectTypeOf(...)<AssociationProxy<Comment>>()` assertions — both
resolve. A regression in the auto-import pass (missing registry
entry, wrong relative path, etc.) fails this CI job.

The companion file `../dx-tests/declare-patterns.test-d.ts` is the manual
escape hatch — useful when a model needs a type declaration the virtualizer
doesn't produce yet, or to document the shape for reference.
