import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./constructor-creates-no-promise.mjs";

const fixture = `${import.meta.dirname}/constructor-creates-no-promise-fixture`;

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
  import { Thread } from "./ruby-compat/lib/thread";
  declare function later(): Promise<void>;
  declare function now(): number;
  declare const rescuable: { catch(fn: () => void): void };
`;

const localThread = `
  declare function later(): Promise<void>;
  declare class Thread { constructor(fn: () => Promise<void>); then(fn: () => void): void; }
`;

const inCtor = (body, extra = "") =>
  `${declarations} class Klass { p: unknown; ${extra} constructor() { ${body} } }`;

const at = (code, messageId) => ({
  code,
  filename: `${fixture}/file.ts`,
  errors: [{ messageId }],
});

tester.run("constructor-creates-no-promise", rule, {
  valid: [
    inCtor("now();"),
    inCtor("this.p = () => later();"),
    inCtor("this.p = new Thread(async () => { await later(); });"),
    inCtor("rescuable.catch(() => {});"),
    `${declarations} class Klass { method() { void later(); } }`,
    `${declarations} class Klass { protected constructor() {} static async new() { const obj = new Klass(); await later(); return obj; } }`,
    `${declarations} class Klass { private constructor() {} static async new() { return new Klass(); } }`,
  ].map((code) => ({ code, filename: `${fixture}/file.ts` })),
  invalid: [
    at(inCtor("later();"), "promise"),
    at(inCtor("void later();"), "promise"),
    at(inCtor("this.p = later();"), "promise"),
    at(inCtor("this.p = new Promise<void>((resolve) => resolve());"), "promise"),
    at(inCtor("this.p = new Thread(async () => {}).value();"), "promise"),
    at(inCtor("this.p = new Thread(async () => {}).join();"), "promise"),
    at(
      `${localThread} class Klass { p: unknown; constructor() { this.p = new Thread(later); } }`,
      "promise",
    ),
    at(inCtor("(this.p as Promise<void>).finally(now);"), "chain"),
    at(inCtor("later().then(now);"), "chain"),
    at(inCtor("(async () => { await later(); })();"), "asyncIife"),
    at(
      `${declarations} class Klass { constructor() {} static async new() { return new Klass(); } }`,
      "publicConstructor",
    ),
    at(
      `${declarations} class Klass { static async new() { return new Klass(); } }`,
      "publicConstructor",
    ),
  ],
});
