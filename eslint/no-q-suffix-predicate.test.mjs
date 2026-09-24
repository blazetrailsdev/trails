import { RuleTester } from "eslint";
import rule from "./no-q-suffix-predicate.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("no-q-suffix-predicate", rule, {
  valid: [
    "class Pool { isConnectedTo(): boolean { return true; } }",
    "export function isPrimaryClass(): boolean { return true; }",
    "const SQL = 1; const Q = 2;",
    "function f() { const idQ = quote('id'); return idQ; }",
    "const o = { isValid: true, ['fooQ']: 1 };",
  ],
  invalid: [
    {
      code: "class Pool { connectedToQ(): boolean { return true; } }",
      errors: [
        { messageId: "qSuffix", data: { name: "connectedToQ", suggestion: "isConnectedTo" } },
      ],
    },
    {
      code: "class Pool { get primaryClassQ(): boolean { return true; } }",
      errors: [{ messageId: "qSuffix" }],
    },
    {
      code: "export function validateTimestampQ(): boolean { return true; }",
      errors: [{ messageId: "qSuffix" }],
    },
    {
      code: "export const blankQ = (x: unknown) => x == null;",
      errors: [{ messageId: "qSuffix", data: { name: "blankQ", suggestion: "isBlank" } }],
    },
    {
      code: "interface Host { persistedQ(): boolean; }",
      errors: [{ messageId: "qSuffix" }],
    },
    {
      code: "export const ClassMethods = { attributeMethodQ(name: string) { return true; } };",
      errors: [{ messageId: "qSuffix" }],
    },
  ],
});
