// Runtime-safe Ruby-source guard. Kept in its own module (no `typescript`
// import) so generator actions can pull it in without forcing the
// `typescript` peer into the runtime dependency graph. `testing.ts`
// re-exports this symbol for test-side callers.

// `def` has no TS analogue, so any `def <name>` is Ruby (with or without
// parens). `class`/`module` are tricky — TS uses `class Foo {` / `class
// Foo<T> {`, Ruby uses `class Foo`, `class Foo < Bar`, or `class Foo::Bar`.
// Match the Ruby trailers (`< Parent`, `::Ns`, or EOL) explicitly so TS's
// `{`/`<T>` openers don't trip the check.
const RUBY_RE = /^\s*(?:def\s+\w+|(?:class|module)\s+[A-Z]\w*(?:::\w+)*\s*(?:$|<\s+\w))/m;

export function assertNoRubySource(text: string): void {
  const m = text.match(RUBY_RE);
  if (m) {
    throw new Error(`Ruby-like source detected: ${JSON.stringify(m[0])}`);
  }
}
