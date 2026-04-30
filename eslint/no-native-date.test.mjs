import { RuleTester } from "eslint";
import rule from "./no-native-date.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("no-native-date", rule, {
  valid: [
    // No Date usage at all.
    "const x = 1;",
    // Locally-bound Date (mirrors AR Type::Date import shadowing global).
    'import { Date } from "./local.js";\nconst d = new Date();',
    // Same-line trailing boundary marker.
    "const d = new Date(); // boundary: legacy callers",
    // Immediately-preceding boundary marker.
    "// boundary: legacy callers\nconst d = new Date();",
    // Block-comment boundary marker on preceding line.
    "/* boundary: legacy callers */\nconst d = new Date();",
    // File-level @boundary-file directive exempts the entire file.
    `/**
 * @boundary-file: HTTP date handling.
 */
const d = new Date();
function f(x: unknown) {
  return x instanceof Date;
}`,
    // Boundary on guarded instanceof.
    "function f(x: unknown) { /* boundary: defensive */ if (x instanceof Date) return x; }",
    // Out of scope: Date.{now,parse,UTC} return numbers, not Date values.
    "const t = Date.now();",
    "const t = Date.parse('2024-01-01');",
    "const t = Date.UTC(2024, 0, 1);",
    // Out of scope: `: Date` type annotations alone don't trigger the rule.
    "function f(d: Date): string { return ''; }",
    // Multi-line instanceof — boundary marker on the `Date` line, not the
    // start line of the surrounding expression.
    `function f(x: unknown) {
  return (
    x instanceof
    Date // boundary: legacy multi-line shape
  );
}`,
    // Multi-line globalThis.Date — marker on the `.Date` line works even
    // though loc.start of the MemberExpression points at `globalThis`.
    `function f(x: unknown) {
  return (
    x instanceof
    globalThis
      .Date // boundary: legacy multi-line shape
  );
}`,
  ],

  invalid: [
    {
      code: "const d = new Date();",
      errors: [{ messageId: "noNew" }],
    },
    {
      code: "function f(x: unknown) { return x instanceof Date; }",
      errors: [{ messageId: "noInstanceof" }],
    },
    // globalThis.Date / window.Date / self.Date / global.Date variants.
    {
      code: "const d = new globalThis.Date();",
      errors: [{ messageId: "noNew" }],
    },
    {
      code: "function f(x: unknown) { return x instanceof globalThis.Date; }",
      errors: [{ messageId: "noInstanceof" }],
    },
    {
      code: "const d = new window.Date();",
      errors: [{ messageId: "noNew" }],
    },
    // Non-JSDoc block comment with @boundary-file: doesn't exempt the file.
    {
      code: "/* @boundary-file: not-jsdoc */\nconst d = new Date();",
      errors: [{ messageId: "noNew" }],
    },
    // Boundary keyword in unrelated comment doesn't exempt.
    {
      code: "// just a comment\nconst d = new Date();",
      errors: [{ messageId: "noNew" }],
    },
    // Boundary marker on a non-adjacent prior line doesn't exempt.
    {
      code: "// boundary: explanation\n\nconst x = 1;\nconst d = new Date();",
      errors: [{ messageId: "noNew" }],
    },
  ],
});

console.log("no-native-date: all tests passed");
