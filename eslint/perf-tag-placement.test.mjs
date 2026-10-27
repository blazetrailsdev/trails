import { RuleTester } from "eslint";
import rule from "./perf-tag-placement.mjs";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

const RECEIPT = "100ns — CONVERGEABLE rbfsend-per-prototype-writer-cache";

tester.run("perf-tag-placement", rule, {
  valid: [
    `/** @perf ${RECEIPT} */\nfunction f() {}\n`,
    `/**\n * @internal\n * @perf ${RECEIPT}\n */\nexport function f() {}\n`,
    `/** @perf 2x — PERMANENT */\nlet cache = new WeakMap();\n`,
    `class A {\n  /** @perf 30% — PERMANENT */\n  m() {}\n}\n`,
  ],
  invalid: [
    { code: `/** @perf fast */\nfunction f() {}\n`, errors: [{ messageId: "malformed" }] },
    {
      code: `/** @perf 100ns — CONVERGEABLE */\nfunction f() {}\n`,
      errors: [{ messageId: "malformed" }],
    },
    {
      code: `/** @perf 100ns — PERMANENT because */\nfunction f() {}\n`,
      errors: [{ messageId: "malformed" }],
    },
    { code: `f();\n/** @perf ${RECEIPT} */\n`, errors: [{ messageId: "orphan" }] },
    { code: `/** @perf ${RECEIPT} */\nf();\n`, errors: [{ messageId: "orphan" }] },
  ],
});
