import { RuleTester } from "eslint";
import rule from "./no-ruby-compat-reimplementation.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const FLAGGED = "packages/activerecord/src/support/new-helper.ts";
/** A seeded row in eslint/no-ruby-compat-reimplementation-exclude.json. */
const ALLOWLISTED = "packages/i18n/src/backend/simple.ts";
const IN_RUBY_COMPAT = "packages/ruby-compat/src/core-ext/regexp.ts";

tester.run("no-ruby-compat-reimplementation", rule, {
  valid: [
    {
      filename: IN_RUBY_COMPAT,
      code: `export function regexpEscape(string: string): string { return string; }`,
    },
    {
      filename: ALLOWLISTED,
      code: `export function isSymbol(value: unknown): boolean { return !!value; }`,
    },
    {
      // Rails-anchored homonyms: `ActiveSupport::Cache::Store#fetch`
      // (activesupport/lib/active_support/cache.rb:444), `Session#dig`,
      // `ActionController::Parameters#dig`.
      filename: FLAGGED,
      code: `class Store { fetch(name: string): unknown { return name; } }
class Session { dig(...keys: string[]): unknown { return keys; } }
class Parameters { dig(...keys: string[]): unknown { return keys; } }`,
    },
    {
      // `ActiveRecord::Core#<=>` (activerecord/lib/active_record/core.rb:665)
      // ports to a function named `compare`, which is why it is not registered.
      filename: FLAGGED,
      code: `export function compare(a: unknown, b: unknown): number { return 0; }`,
    },
    {
      // A registered name with the wrong CONTEXT: `fetch` is an alias only over
      // a `Record`, which is what a `Hash#fetch` copy looks like.
      filename: FLAGGED,
      code: `function fetch(url: string): unknown { return url; }`,
    },
    {
      filename: "packages/activerecord/src/support/new-helper.test.ts",
      code: `function escapeRegExp(s: string): string { return s; }`,
    },
  ],

  invalid: [
    {
      filename: FLAGGED,
      code: `function escapeRegExp(s: string): string { return s; }`,
      errors: [{ messageId: "reimplementation" }],
    },
    {
      filename: FLAGGED,
      code: `const isSymbol = (value: unknown): boolean => typeof value === "string";`,
      errors: [{ messageId: "reimplementation" }],
    },
    {
      filename: FLAGGED,
      code: `class KeyError extends Error {}`,
      errors: [{ messageId: "reimplementation" }],
    },
    {
      filename: FLAGGED,
      code: `export const KeyError = class extends Error {};`,
      errors: [{ messageId: "reimplementation" }],
    },
    {
      filename: FLAGGED,
      code: `function fetch<T>(hash: Record<string, unknown>, key: string, defaultValue: T): T { return defaultValue; }`,
      errors: [{ messageId: "reimplementation" }],
    },
    {
      // The allowlist is keyed by (file, name): the same name in a different
      // file is new code, and a new row is never the remedy.
      filename: FLAGGED,
      code: `function cmp(a: unknown, b: unknown): number { return 0; }`,
      errors: [{ messageId: "reimplementation" }],
    },
  ],
});
