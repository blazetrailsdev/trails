import { RuleTester } from "eslint";
import rule from "./no-raw-control-bytes.mjs";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

// Built from escapes so this test file cannot itself become binary.
const NUL = String.fromCharCode(0);
const ESC = String.fromCharCode(0x1b);
const DEL = String.fromCharCode(0x7f);

tester.run("no-raw-control-bytes", rule, {
  valid: [
    // Ordinary source.
    { code: `const x = 1;\n` },
    // Tabs and CRLF are plain whitespace, not binary-detection triggers.
    { code: `const y = {\n\ta: 1,\n};\r\n` },
    // The escape form of a control byte is exactly what the rule asks for.
    { code: "const key = `${a}\\0${b}`;\n" },
    { code: 'const esc = "\\x1b[0m";\n' },
    // Non-ASCII text is fine — only control bytes are flagged.
    { code: `const em = "— ok ✓";\n` },
  ],
  invalid: [
    {
      code: `const key = \`\${a}${NUL}\${b}\`;\n`,
      errors: [{ messageId: "forbidden", data: { name: "U+0000" } }],
    },
    {
      code: `const esc = "${ESC}[0m";\n`,
      errors: [{ messageId: "forbidden", data: { name: "U+001B" } }],
    },
    // A control byte inside a comment is just as invisible to grep.
    {
      code: `// note${DEL}\nconst z = 1;\n`,
      errors: [{ messageId: "forbidden", data: { name: "U+007F" } }],
    },
    // Every occurrence is reported, not just the first.
    {
      code: `const a = "${NUL}";\nconst b = "${NUL}";\n`,
      errors: [{ messageId: "forbidden" }, { messageId: "forbidden" }],
    },
  ],
});
