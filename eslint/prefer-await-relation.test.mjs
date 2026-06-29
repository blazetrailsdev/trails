import { RuleTester } from "eslint";
import rule from "./prefer-await-relation.mjs";

// Use the TypeScript parser — the rule is enforced on *.ts files (both app
// code and tests), and TS-only wrapper forms must parse to be exercised.
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
    // synchronous, plain expression
    { code: "const arr = e.toArray();" },
    { code: "const all = [...this._viewPaths.toArray(), ...paths];" },
    { code: "ship.parts.toArray();" },
    // returned but not awaited — `result` here is a raw Result, not a relation
    { code: "function f(result: any) { return result.toArray(); }" },
    // arrow body, not awaited
    { code: "const f = (result: any) => result.toArray();" },
    // .then chain, not awaited
    { code: "ship.parts.toArray().then((p: any) => p);" },
  ],
  invalid: [
    // awaited relation.toArray()
    {
      code: "async function f(rel: any) { await rel.toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(rel: any) { await rel; }",
    },
    // assigned from an awaited call
    {
      code: "async function f(rel: any) { const a = await rel.where({ x: 1 }).toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(rel: any) { const a = await rel.where({ x: 1 }); }",
    },
    // awaited, chained off a method call
    {
      code: "async function f(Post: any) { return await Post.all().toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(Post: any) { return await Post.all(); }",
    },
    // awaited through parentheses
    {
      code: "async function f(rel: any) { const a = await (rel.toArray()); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(rel: any) { const a = await (rel); }",
    },
    // awaited through a TS assertion wrapper
    {
      code: "async function f(rel: any) { await (rel.toArray() as any[]); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(rel: any) { await (rel as any[]); }",
    },
    // optional-chained call, awaited
    {
      code: "async function f(rel: any) { await rel?.toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(rel: any) { await rel; }",
    },
  ],
});

console.log("prefer-await-relation: all tests passed");
