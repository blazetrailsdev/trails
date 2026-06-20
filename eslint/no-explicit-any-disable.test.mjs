import { RuleTester } from "eslint";
import rule from "./no-explicit-any-disable.mjs";

// Stub the referenced rules so ESLint's directive processing doesn't emit a
// "Definition for rule ... was not found" error for the directives under test.
const noop = { create: () => ({}) };

const tester = new RuleTester({
  plugins: {
    "@typescript-eslint": { rules: { "no-explicit-any": noop } },
  },
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("no-explicit-any-disable", rule, {
  valid: [
    // Normal code, no directives.
    { code: `const x: number = 1;\n` },
    // Disable of an unrelated rule is allowed.
    {
      code: `// eslint-disable-next-line no-console\nconsole.log("ok");\n`,
    },
    {
      code: `/* eslint-disable no-console */\nconsole.log("ok");\n`,
    },
    // A directive for a different (core) rule is allowed.
    {
      code: `const y = 1; // eslint-disable-line no-unused-vars\n`,
    },
  ],
  invalid: [
    // Targeted disable-next-line.
    {
      code: `// eslint-disable-next-line @typescript-eslint/no-explicit-any\nconst a = 1 as any;\n`,
      errors: [{ messageId: "forbidden" }],
    },
    // Targeted disable-line.
    {
      code: `const b = 1 as any; // eslint-disable-line @typescript-eslint/no-explicit-any\n`,
      errors: [{ messageId: "forbidden" }],
    },
    // Targeted block disable.
    {
      code: `/* eslint-disable @typescript-eslint/no-explicit-any */\nconst c = 1 as any;\n`,
      errors: [{ messageId: "forbidden" }],
    },
    // Targeted alongside another rule in the same directive.
    {
      code: `// eslint-disable-next-line no-console, @typescript-eslint/no-explicit-any\nconst d = 1 as any;\n`,
      errors: [{ messageId: "forbidden" }],
    },
    // Targeted with a `-- description` trailer.
    {
      code: `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy\nconst e = 1 as any;\n`,
      errors: [{ messageId: "forbidden" }],
    },
    // Bare line-comment disable — kills every rule, including this one.
    {
      code: `/* eslint-disable */\nconst f = 1 as any;\n`,
      errors: [{ messageId: "forbidden" }],
    },
    {
      code: `// eslint-disable-next-line\nconst g = 1 as any;\n`,
      errors: [{ messageId: "forbidden" }],
    },
    // Bare disable-line — covers its own line.
    {
      code: `const h = 1 as any; // eslint-disable-line\n`,
      errors: [{ messageId: "forbidden" }],
    },
  ],
});
