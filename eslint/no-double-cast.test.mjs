import { RuleTester } from "eslint";
import rule from "./no-double-cast.mjs";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("no-double-cast", rule, {
  valid: [
    { code: `const a = x as string;\n` },
    { code: `const a = x as unknown;\n` },
    { code: `const a = (x as string) as number;\n` },
  ],
  invalid: [
    { code: `const a = x as unknown as string;\n`, errors: [{ messageId: "doubleCast" }] },
    { code: `const a = (x as unknown) as Foo<number>;\n`, errors: [{ messageId: "doubleCast" }] },
    { code: `const a = <string>(<unknown>x);\n`, errors: [{ messageId: "doubleCast" }] },
    {
      code: `f(a as unknown as A, b as unknown as B);\n`,
      errors: [{ messageId: "doubleCast" }, { messageId: "doubleCast" }],
    },
  ],
});
