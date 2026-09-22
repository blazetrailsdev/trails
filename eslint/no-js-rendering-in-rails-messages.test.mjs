import { RuleTester } from "eslint";
import rule from "./no-js-rendering-in-rails-messages.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const error = (what, where) => ({ messageId: "jsRendering", data: { what, where } });
const THROW = "a `throw new` argument";
const INSPECT = "an `inspect` body";

tester.run("no-js-rendering-in-rails-messages", rule, {
  valid: [
    "function toJSON(x: unknown) { return JSON.stringify(x); }",
    "function castValue(value: unknown) { return String(value); }",
    "const key = `${x.constructor.name}:${JSON.stringify(y)}`;",
    "throw new ArgumentError(`missing values for ${rbInspect(missing)}`);",
    "throw new TypeError(`can't quote ${rbObjClass(value)}`);",
    "throw new (errors[String(kind)])('m');",
    "const msg = JSON.stringify(x); throw new ArgumentError(msg);",
    "const e = new ArgumentError(JSON.stringify(x));",
    `/**
 * @noRailsEquivalent PERMANENT
 */

import { x } from "./x.js";
throw new Error(JSON.stringify(x));`,
    "const s = obj.inspect(JSON.stringify(x));",
  ],
  invalid: [
    {
      code: "throw new ArgumentError(`deferrable must be ${JSON.stringify(mode)}`);",
      errors: [error("JSON.stringify()", THROW)],
    },
    {
      code: "throw new TypeError(`can't quote ${value.constructor.name}`);",
      errors: [error(".constructor.name", THROW)],
    },
    {
      code: "throw new TypeError(`can't quote ${(value as object).constructor?.name}`);",
      errors: [error(".constructor.name", THROW)],
    },
    {
      code: "throw new ArgumentError('bad: ' + String(values));",
      errors: [error("String()", THROW)],
    },
    {
      code: "throw new ArgumentError(items.map((i) => JSON.stringify(i)).join(', '));",
      errors: [error("JSON.stringify()", THROW)],
    },
    {
      code: "class HashConfig { inspect() { return `#<${this.constructor.name} name=${this.name}>`; } }",
      errors: [error(".constructor.name", INSPECT)],
    },
    {
      code: 'class Pool { [Symbol.for("nodejs.util.inspect.custom")]() { return JSON.stringify(this); } }',
      errors: [error("JSON.stringify()", INSPECT)],
    },
    {
      code: "export function inspect(this: Paths) { return String(this.paths); }",
      errors: [error("String()", INSPECT)],
    },
  ],
});
