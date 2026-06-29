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
    // synchronous non-relation .toArray() — not in a Promise-consuming
    // position, so excluded (ActiveModel Errors, OrderedHash, view paths).
    { code: "const arr = e.toArray();" },
    { code: "const all = [...this._viewPaths.toArray(), ...paths];" },
    { code: "ship.parts.toArray();" },
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
    // returned (thenable) — relation, consumed as a Promise
    {
      code: "function f(rel: any) { return rel.toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "function f(rel: any) { return rel; }",
    },
    // .then chain
    {
      code: "ship.parts.toArray().then((p: any) => p);",
      errors: [{ messageId: "preferAwait" }],
      output: "ship.parts.then((p: any) => p);",
    },
    // chained off a method call
    {
      code: "async function f(Post: any) { return await Post.all().toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(Post: any) { return await Post.all(); }",
    },
    // optional-chained call
    {
      code: "async function f(rel: any) { await rel?.toArray(); }",
      errors: [{ messageId: "preferAwait" }],
      output: "async function f(rel: any) { await rel; }",
    },
  ],
});

console.log("prefer-await-relation: all tests passed");
