import { RuleTester } from "eslint";
import rule from "./nie-requires-annotation.mjs";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("nie-requires-annotation", rule, {
  valid: [
    {
      code: `function f() {\n  // @nie disposition=port-real rails=foo.rb:1 cluster=bar\n  throw new NotImplementedError("x");\n}\n`,
    },
    {
      code: `function f() {\n  // @nie disposition=keep-as-strategy-hook\n  throw new NotImplementedError("x");\n}\n`,
    },
    {
      code: `function f() {\n  throw new TypeError("not the target rule");\n}\n`,
    },
  ],
  invalid: [
    {
      code: `function f() {\n  throw new NotImplementedError("x");\n}\n`,
      errors: [{ messageId: "missing" }],
      output: `function f() {\n  // @nie disposition=TODO\n  throw new NotImplementedError("x");\n}\n`,
    },
    {
      code: `function f() {\n  // unrelated comment\n  throw new NotImplementedError("x");\n}\n`,
      errors: [{ messageId: "missing" }],
      output: `function f() {\n  // unrelated comment\n  // @nie disposition=TODO\n  throw new NotImplementedError("x");\n}\n`,
    },
    {
      code: `function f() {\n  // @nie disposition=bogus\n  throw new NotImplementedError("x");\n}\n`,
      errors: [{ messageId: "invalid", data: { value: "bogus" } }],
    },
  ],
});
