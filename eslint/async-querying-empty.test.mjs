import { RuleTester } from "eslint";
import rule from "./async-querying-empty.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("async-querying-empty", rule, {
  valid: [
    // The querying spelling: `async`, so blank?'s probe holds it out.
    "class Relation { async isEmpty(): Promise<boolean> { return true; } }",
    "class Relation { async isEmpty(): Promise<boolean> | boolean { return true; } }",
    // A synchronous `empty?` is exactly what the probe exists to invoke.
    "class Buffer { isEmpty(): boolean { return true; } }",
    "class Wrapper { empty(): boolean { return false; } }",
    "function isEmpty(): boolean { return true; }",
    "const isEmpty = (): boolean => true;",
    // An unannotated body is out of scope — there is no declared promise here.
    "class Relation { isEmpty() { return Promise.resolve(true); } }",
    // Not one of the probe's names.
    "class Relation { isBlank(): Promise<boolean> { return Promise.resolve(true); } }",
    // A signature cannot carry `async`; the implementor is what this rule gates.
    "interface Collection { isEmpty(): Promise<boolean>; }",
    // An explicit name list narrows the defaults rather than adding to them.
    {
      code: "class W { empty(): Promise<boolean> { return Promise.resolve(true); } }",
      options: [{ names: ["isEmpty"] }],
    },
  ],
  invalid: [
    {
      code: "class Relation { isEmpty(): Promise<boolean> { return this.count().then((c) => c === 0); } }",
      errors: [{ messageId: "missingAsync", data: { name: "isEmpty" } }],
    },
    {
      code: "class Wrapper { empty(): PromiseLike<boolean> { return load(); } }",
      errors: [{ messageId: "missingAsync", data: { name: "empty" } }],
    },
    // A union with a promise arm still reaches the probe holding a thenable.
    {
      code: "const obj = { isEmpty(): Promise<boolean> | boolean { return load(); } };",
      errors: [{ messageId: "missingAsync", data: { name: "isEmpty" } }],
    },
    {
      code: "function isEmpty(): Promise<boolean> { return load(); }",
      errors: [{ messageId: "missingAsync", data: { name: "isEmpty" } }],
    },
    {
      code: "const isEmpty = (): Promise<boolean> => load();",
      errors: [{ messageId: "missingAsync", data: { name: "isEmpty" } }],
    },
  ],
});
