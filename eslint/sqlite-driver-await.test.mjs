import { RuleTester } from "eslint";
import rule from "./sqlite-driver-await.mjs";

// Use the TypeScript parser — the rule is enforced on *.ts files, and
// TS-only wrapper forms (driver!, driver as T) must parse to be tested.
const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("sqlite-driver-await", rule, {
  valid: [
    // awaited call
    { code: "async function f(driver: any) { await driver.run('SELECT 1'); }" },
    // parenthesized await
    { code: "async function f(driver: any) { await (driver.run('SELECT 1')); }" },
    // .then() chain
    { code: "driver.run('SELECT 1').then((r: unknown) => r);" },
    // .catch() chain
    { code: "driver.run('SELECT 1').catch((e: unknown) => e);" },
    // .finally() chain
    { code: "driver.run('SELECT 1').finally(() => cleanup());" },
    // property access (no call) — driver.raw, driver.open
    { code: "const db = driver.raw;" },
    { code: "const ok = driver.open;" },
    // this.driver.exec() — MemberExpression object, not Identifier; excluded by design
    { code: "this.driver.exec('PRAGMA x');" },
    // deeply nested await
    { code: "async function f(driver: any) { const r = await driver.exec('PRAGMA'); }" },
    // non-null assertion, but awaited
    { code: "async function f(driver: any) { await driver!.run('x'); }" },
    // type assertion, but awaited
    { code: "async function f(driver: any) { await (driver as any).run('x'); }" },
    // parenthesized call with .then chain
    { code: "(driver.run('SELECT 1')).then((r: unknown) => r);" },
  ],
  invalid: [
    // bare identifier call
    {
      code: "driver.run('SELECT 1');",
      errors: [{ messageId: "missingAwait" }],
    },
    // assignment without await
    {
      code: "const r = driver.prepare('SELECT 1');",
      errors: [{ messageId: "missingAwait" }],
    },
    // second call in sequence misses await
    {
      code: "async function f(driver: any) { await driver.exec('A'); driver.run('B'); }",
      errors: [{ messageId: "missingAwait" }],
    },
    // returned without await
    {
      code: "function f(driver: any) { return driver.pragma('x'); }",
      errors: [{ messageId: "missingAwait" }],
    },
    // arbitrary chain (not then/catch/finally) is not safe
    {
      code: "driver.run('SELECT 1').rows;",
      errors: [{ messageId: "missingAwait" }],
    },
    // non-null assertion without await
    {
      code: "driver!.run('SELECT 1');",
      errors: [{ messageId: "missingAwait" }],
    },
    // type assertion without await
    {
      code: "(driver as any).run('SELECT 1');",
      errors: [{ messageId: "missingAwait" }],
    },
  ],
});

console.log("sqlite-driver-await: all tests passed");
