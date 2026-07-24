import { RuleTester } from "eslint";
import rule from "./prefer-await-relation.mjs";

// Use the TypeScript parser — the rule is enforced on *.ts files (both app
// code and tests), and TS-only wrapper forms must parse to be exercised.
//
// RuleTester runs without type information (no `program`), so the rule's
// thenable-type gate degrades to permissive here; these cases exercise the
// syntactic gate — directly-awaited position — and the `.toArray()`/`super`
// shape checks. The type gate itself is exercised by `pnpm lint` over the real
// codebase (where `projectService` supplies types), which is where the
// LoadedRelation / raw `Result` receivers are proven to be left alone.
const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("prefer-await-relation", rule, {
  valid: [
    // direct await — already the preferred form
    { code: "async function f(rel: any) { await rel; }" },
    // not a .toArray() call
    { code: "const a = rel.toList();" },
    // property access, not a call
    { code: "const fn = rel.toArray;" },
    // .toArray(arg) with arguments is not the relation accessor
    { code: "const a = rel.toArray(1);" },
    // computed member access is not matched
    { code: "const a = rel['toArray']();" },
    // Not directly awaited — excluded so non-relation `.toArray()` accessors
    // (raw query Result, ActiveModel Errors, OrderedHash, view-path/streaming
    // wrappers) are never mis-flagged or mis-rewritten:
    { code: "const arr = e.toArray();" },
    { code: "const all = [...this._viewPaths.toArray(), ...paths];" },
    { code: "ship.parts.toArray();" },
    // returned but not awaited — `result` here is a raw Result, not a relation
    { code: "function f(result: any) { return result.toArray(); }" },
    { code: "const f = (result: any) => result.toArray();" },
    // .then chain, not awaited
    { code: "ship.parts.toArray().then((p: any) => p);" },
    // `super` — `await super` is a syntax error, so a `super.toArray()` receiver
    // is left alone rather than rewritten to uncompilable code.
    { code: "class R extends B { async f() { return await super.toArray(); } }" },
    // `this` inside a relation method — a method invoked on the then-less view
    // returned by load/reload/presence binds `this` to that view, whose `then`
    // is undefined, so `await this` would resolve to the view, not the array;
    // `this`'s type can never narrow to the stripped view. Left alone. See header.
    { code: "class R { async f() { return await this.toArray(); } }" },
    // No `reload().toArray()` case here: reload() returns a then-stripped
    // LoadedRelation whose `.toArray()` is load-bearing, but that exclusion is
    // the thenable-type gate's job — untestable without type info, so it is
    // exercised by `pnpm lint` over the real codebase (see header), not here.
  ],
  invalid: [
    // Awaited identifier binding — the widened receiver gate now reports these
    // (PR #4968 made every thenable-typed binding awaitable again).
    {
      code: "async function f(rel: any) { await rel.toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(rel: any) { await rel; }",
    },
    // member read — a cached association proxy is awaitable again
    {
      code: "async function f(author: any) { await author.posts.toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(author: any) { await author.posts; }",
    },
    // the `association()` helper (bare function call)
    {
      code: "async function f(rec: any) { await association(rec, 'tags').toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(rec: any) { await association(rec, 'tags'); }",
    },
    // the `record.association(name)` accessor
    {
      code: "async function f(rec: any) { await rec.association('tags').toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(rec: any) { await rec.association('tags'); }",
    },
    // a named scope (arbitrary method name)
    {
      code: "async function f(Post: any) { await Post.mostCommented(3).toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(Post: any) { await Post.mostCommented(3); }",
    },
    // awaited, chained off a query method call
    {
      code: "async function f(rel: any) { const a = await rel.where({ x: 1 }).toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(rel: any) { const a = await rel.where({ x: 1 }); }",
    },
    // awaited, chained off a static query method
    {
      code: "async function f(Post: any) { return await Post.all().toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(Post: any) { return await Post.all(); }",
    },
    // longer chain off a query-method call
    {
      code: "async function f(rel: any) { await rel.order('id').limit(1).toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(rel: any) { await rel.order('id').limit(1); }",
    },
    // parenthesized call receiver — the fixer strips `.toArray()` from the `.`
    // token, so the wrapping parens are preserved (not eaten with the suffix)
    {
      code: "async function f(Post: any) { await (Post.all()).toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(Post: any) { await (Post.all()); }",
    },
    // awaited through a TS assertion wrapper
    {
      code: "async function f(Post: any) { await (Post.all().toArray() as any[]); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(Post: any) { await (Post.all() as any[]); }",
    },
    // optional-chained call, awaited
    {
      code: "async function f(Post: any) { await Post.all()?.toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(Post: any) { await Post.all(); }",
    },
  ],
});

console.log("prefer-await-relation: all tests passed");
