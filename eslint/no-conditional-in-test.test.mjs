import { RuleTester } from "eslint";
import rule from "./no-conditional-in-test.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("no-conditional-in-test", rule, {
  valid: [
    'it("x", () => { if (adapterType === "sqlite") { expect(1).toBe(1); } else { expect(2).toBe(2); } });',
    'it("x", async () => { if (adapterType === "postgres") {} else if (adapterType === "mysql") {} else {} });',
    'test("x", () => { if (currentAdapter("postgres")) {} });',
    'it("x", () => { if (adapterType === "mysql" || !currentAdapter("postgres")) {} });',
    "function helper(x) { if (x) {} }",
    'describe("x", () => { beforeEach(() => { if (y) {} }); });',
  ],
  invalid: [
    {
      code: 'it("x", () => { if (adapterType === "mysql" || rows.length) {} });',
      errors: [{ messageId: "noConditionalInTest" }],
    },
    {
      code: 'it("x", () => { if (adapterType === "mysql" && supportsJsonSchemaValid) {} });',
      errors: [{ messageId: "noConditionalInTest" }],
    },
    {
      code: 'it("x", () => { if (adapterType) {} });',
      errors: [{ messageId: "noConditionalInTest" }],
    },
    {
      code: 'it("x", () => { if (rows.length) { expect(rows[0]).toBe(1); } });',
      errors: [{ messageId: "noConditionalInTest" }],
    },
    {
      code: 'it.skip("x", async () => { if (await conn.supportsX()) {} });',
      errors: [{ messageId: "noConditionalInTest" }],
    },
    {
      code: 'test("x", () => { if (adapter) {} });',
      errors: [{ messageId: "noConditionalInTest" }],
    },
  ],
});
