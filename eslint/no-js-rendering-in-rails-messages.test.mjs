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
    // Outside a message: a JSON encoder, a cast, a cache key.
    "function toJSON(x: unknown) { return JSON.stringify(x); }",
    "function castValue(value: unknown) { return String(value); }",
    "const key = `${x.constructor.name}:${JSON.stringify(y)}`;",
    // The Ruby renderings themselves.
    "throw new ArgumentError(`missing values for ${rbInspect(missing)}`);",
    "throw new TypeError(`can't quote ${rbObjClass(value)}`);",
    // The constructor expression is not a rendered argument.
    "throw new (errors[String(kind)])('m');",
    // A message built before the throw is out of reach by design.
    "const msg = JSON.stringify(x); throw new ArgumentError(msg);",
    // `new` without `throw` constructs, it does not raise here.
    "const e = new ArgumentError(JSON.stringify(x));",
    // A file-level receipt means no Rails rendering to mirror.
    `/**
 * @noRailsEquivalent PERMANENT
 */

import { x } from "./x.js";
throw new Error(JSON.stringify(x));`,
    // A member named inspect only matters as a declaration, not a call.
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
