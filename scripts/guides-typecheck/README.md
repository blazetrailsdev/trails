# Guides Code Type Check

Type-checks every ` ```ts ` / ` ```typescript ` code block under
`packages/website/docs/guides/` against the real published types of
`@blazetrails/*` packages. Catches:

- Stale imports (package renamed, module removed).
- Wrong call signatures on real APIs (rename catches up automatically
  when the guide is out of date).
- Syntax errors.

Runs in CI on every push. Run locally with:

```sh
pnpm build && pnpm guides:typecheck
```

(Build is required so the `dist/*.d.ts` files exist for type
resolution via each package's `exports` field.)

Also enforces that every fenced block has a language tag — a bare
` ``` ` with no language is rejected so nothing gets silently
excluded from the check.

## Writing guide examples

Every `ts` block is compiled as its own ES module. The following
illustrative names are declared globally as `any` so short snippets
don't need boilerplate:

`user`, `post`, `comment`, `tx`, `User`, `Post`, `Comment`,
`AnyRecord`.

For anything else — including your own `Model`/`Base` subclasses —
import from `@blazetrails/*` explicitly. That's also how real readers
will copy the code, so it doubles as a sanity check on the example.

**Each block is compiled in isolation.** A `class Post` defined in
one block is not visible to the next. If two blocks need to share
setup, either repeat the shared code or inline it with a comment like
`// assuming Post is defined as above`.

## Skipping a block

Prefix the block with `<!-- typecheck:skip -->` on the line
immediately before the opening fence. Use sparingly — skipped blocks
are invisible to the drift-detection that this check exists for.

```md
<!-- typecheck:skip -->

\`\`\`ts
// intentionally broken, shown for contrast
const x: string = 5;
\`\`\`
```

## How it works

1. Reads every `.md` file under `packages/website/docs/guides/`.
2. Extracts each `ts` / `typescript` fenced block. Checks the
   preceding non-blank line for the `typecheck:skip` marker.
3. Writes each block to `.tmp/run-*/blocks/` as its own `.ts` file
   with an `export {}` suffix (makes it a module so top-level
   `await` works).
4. Writes a shared `globals.d.ts` that declares the illustrative
   names.
5. Runs `tsc --noEmit` across all blocks at once.
6. Remaps tsc's error paths back to the source guide filename and
   absolute line number.

The temp dir lives inside this script's own workspace package so
`@blazetrails/*` resolution walks up to the workspace's symlinked
`node_modules` naturally.
