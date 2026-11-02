import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import {
  prefilterNoFloatingPromises,
  prefilterNoMisusedPromises,
} from "./promise-rule-prefilters.mjs";

const fixture = `${import.meta.dirname}/promise-rule-prefilters-fixture`;

const inFixture = ({ valid, invalid }) => ({
  valid: valid.map((code) => ({ code, filename: `${fixture}/file.ts` })),
  invalid: invalid.map((test) => ({ ...test, filename: `${fixture}/file.ts` })),
});

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: {
      project: "./tsconfig.json",
      tsconfigRootDir: fixture,
    },
  },
});

const declarations = `
  declare function nothing(): void;
  declare function maybe(): string | undefined;
  declare function later(): Promise<void>;
  declare function many(): Promise<number>[];
  declare function laterMany(): Promise<Promise<number>[]>;
  declare function either(a: string): void;
  declare function either(a: number): Promise<void>;
  declare function generic<T>(a: T): T;
  declare const anything: any;
  declare function run(callback: () => void): void;
  declare function runAsync(callback: () => Promise<void>): void;
`;

const floatingVoid = (statement) => ({
  code: `${declarations} ${statement};`,
  errors: [
    {
      messageId: "floatingVoid",
      suggestions: [
        { messageId: "floatingFixVoid", output: `${declarations} void ${statement};` },
        { messageId: "floatingFixAwait", output: `${declarations} await ${statement};` },
      ],
    },
  ],
});
tester.run(
  "no-floating-promises",
  prefilterNoFloatingPromises(tseslint.plugin.rules["no-floating-promises"]),
  inFixture({
    valid: [
      `${declarations} nothing();`,
      `${declarations} maybe();`,
      `${declarations} let x; x = later();`,
      `${declarations} async function f() { await later(); }`,
      `${declarations} later().catch(() => {});`,
      `${declarations} anything();`,
    ],
    invalid: [
      floatingVoid("later()"),
      floatingVoid("either(1)"),
      floatingVoid("generic(later())"),
      {
        code: `${declarations} many();`,
        errors: [{ messageId: "floatingPromiseArrayVoid" }],
      },
      {
        code: `${declarations} async function f() { await laterMany(); }`,
        errors: [{ messageId: "floatingPromiseArrayVoid" }],
      },
    ],
  }),
);

tester.run(
  "no-misused-promises",
  prefilterNoMisusedPromises(tseslint.plugin.rules["no-misused-promises"]),
  inFixture({
    valid: [
      `${declarations} run(() => {});`,
      `${declarations} run(nothing);`,
      `${declarations} runAsync(later);`,
      `${declarations} runAsync(async () => {});`,
      `${declarations} either("a");`,
    ],
    invalid: [
      {
        code: `${declarations} if (later()) {}`,
        options: [{ checksVoidReturn: { arguments: false } }],
        errors: [{ messageId: "conditional" }],
      },
      { code: `${declarations} run(later);`, errors: [{ messageId: "voidReturnArgument" }] },
      {
        code: `${declarations} run(async () => {});`,
        errors: [{ messageId: "voidReturnArgument" }],
      },
      { code: `${declarations} run(either);`, errors: [{ messageId: "voidReturnArgument" }] },
      { code: `${declarations} if (later()) {}`, errors: [{ messageId: "conditional" }] },
    ],
  }),
);
