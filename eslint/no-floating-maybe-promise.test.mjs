import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./no-floating-maybe-promise.mjs";

const fixture = `${import.meta.dirname}/no-floating-maybe-promise-fixture`;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: {
      project: "./tsconfig.json",
      tsconfigRootDir: fixture,
      disallowAutomaticSingleRunInference: true,
    },
  },
});

const declarations = `
  declare function maybeLater(): PromiseLike<void> | void;
  declare function thenable(): PromiseLike<number>;
  declare function either(): Promise<number> | number;
  declare function plain(): string | number | undefined;
  declare namespace local { interface Promise { then(fn: () => void): void } }
  declare function shadowed(): local.Promise | void;
  declare const obj: { reset?(): PromiseLike<void> | void };
`;

const at = (statement) => ({
  code: `${declarations} ${statement}`,
  filename: `${fixture}/file.ts`,
  errors: [{ messageId: "maybePromise" }],
});

tester.run("no-floating-maybe-promise", rule, {
  valid: [
    `${declarations} plain();`,
    `${declarations} void plain();`,
    `${declarations} either();`,
    `${declarations} async function f() { await maybeLater(); }`,
    `${declarations} function f() { return maybeLater(); }`,
    `${declarations} const x = maybeLater();`,
  ].map((code) => ({ code, filename: `${fixture}/file.ts` })),
  invalid: [at("maybeLater();"), at("void maybeLater();"), at("thenable();"), at("obj.reset?.();")],
});
