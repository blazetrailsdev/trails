import { RuleTester } from "eslint";
import rule from "./prefer-await-relation.mjs";

// Use the TypeScript parser — the rule is enforced on *.ts files (both app
// code and tests), and TS-only wrapper forms must parse to be exercised.
//
// RuleTester runs without type information (no `program`), so the rule's
// thenable-type gate degrades to permissive here; these cases exercise the two
// syntactic gates — directly-awaited position and call-expression receiver. The
// type gate itself is exercised by `pnpm lint` over the real codebase (where
// `projectService` supplies types), which is where the LoadedRelation / raw
// `Result` receivers are proven to be left alone.
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
    // Awaited, but the receiver is NOT a call expression — these are left alone
    // because the binding may be a `stripThenable`'d instance whose `.then` was
    // deleted in place (await would then resolve to the relation, not the array):
    // bare identifier
    { code: "async function f(rel: any) { await rel.toArray(); }" },
    // `this` inside a relation method (may be stripped: load/reload/presence)
    { code: "class R { async f() { return await this.toArray(); } }" },
    // `super` — `await super` is a syntax error anyway
    { code: "class R extends B { async f() { return await super.toArray(); } }" },
    // member read — a cached association proxy may have been stripped
    { code: "async function f(author: any) { await author.posts.toArray(); }" },
    // call expression, but NOT a relation-spawning query method — these return a
    // cached/memoized relation that load/reload/clear/push may have stripped:
    // the `association()` helper (bare function call)
    { code: "async function f(rec: any) { await association(rec, 'tags').toArray(); }" },
    // the `record.association(name)` accessor (property not in SPAWN_METHODS)
    { code: "async function f(rec: any) { await rec.association('tags').toArray(); }" },
    // a named scope (arbitrary method name, may be memoized on the proxy)
    { code: "async function f(Post: any) { await Post.mostCommented(3).toArray(); }" },
    // reload() returns a then-stripped LoadedRelation
    { code: "async function f(rel: any) { await rel.reload().toArray(); }" },
  ],
  invalid: [
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
    // longer chain, still a call-expression receiver
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
