import { RuleTester } from "eslint";
import rule from "./no-explicit-any-disable.mjs";

// Stub the referenced rules so ESLint's directive processing doesn't emit a
// "Definition for rule ... was not found" error for the directives under test.
const noop = { create: () => ({}) };

const tester = new RuleTester({
  plugins: {
    "@typescript-eslint": { rules: { "no-explicit-any": noop, "no-explicit-anyx": noop } },
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
    // A rule whose name merely contains the target as a substring is not it.
    {
      code: `// eslint-disable-next-line @typescript-eslint/no-explicit-anyx\nconst z = 1;\n`,
    },
    // A comment that isn't a directive (text precedes `eslint-disable`).
    {
      code: `// see eslint-disable @typescript-eslint/no-explicit-any below\nconst w = 1;\n`,
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
    // Bare block disable — kills every rule, including this one. Reported at
    // line 0 to escape its own suppression; message names the real line.
    {
      code: `/* eslint-disable */\nconst f = 1 as any;\n`,
      errors: [{ messageId: "forbiddenBare", data: { line: "1" }, line: 0 }],
    },
    // Bare disable-next-line disables every rule too, but doesn't cover its own
    // line, so it reports in place (still the "bare" message).
    {
      code: `// eslint-disable-next-line\nconst g = 1 as any;\n`,
      errors: [{ messageId: "forbiddenBare", data: { line: "1" }, line: 1 }],
    },
    // Bare disable-line — covers its own line, so it's the line-0 form too.
    {
      code: `const h = 1 as any; // eslint-disable-line\n`,
      errors: [{ messageId: "forbiddenBare", data: { line: "1" }, line: 0 }],
    },
  ],
});
