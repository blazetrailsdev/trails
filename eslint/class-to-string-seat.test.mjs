import { RuleTester } from "eslint";
import * as path from "path";
import { fileURLToPath } from "url";
import rule from "./class-to-string-seat.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "packages/activejob/src/base.ts";
const manifest = {
  files: {
    [FILE]: { classPaths: { Base: "ActiveJob::Base", Inner: "ActiveJob::Base::Inner" } },
  },
};

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const at = (code, extra = {}) => ({
  code,
  filename: path.join(ROOT, FILE),
  options: [{ manifest }],
  ...extra,
});
const seat = (name) => `static toString(): string {\n    return "${name}";\n  }`;

tester.run("class-to-string-seat", rule, {
  valid: [
    at(`export class Base {\n  ${seat("ActiveJob::Base")}\n}`),
    at("export class Unmatched {}"),
    at("export class Base {}", { filename: path.join(ROOT, "packages/activejob/src/other.ts") }),
    at(`/**\n * @noRailsEquivalent PERMANENT\n */\n\nexport class Base {}`),
  ],
  invalid: [
    at("export class Base {\n  foo = 1;\n}", {
      errors: [{ messageId: "missing" }],
      output: `export class Base {\n  ${seat("ActiveJob::Base")}\n\n  foo = 1;\n}`,
    }),
    at("class Inner extends Base {}", {
      errors: [{ messageId: "missing" }],
      output: `class Inner extends Base {\n  ${seat("ActiveJob::Base::Inner")}\n}`,
    }),
    at(`export class Base {\n  ${seat("ActiveJob::Old")}\n}`, {
      errors: [{ messageId: "stale" }],
      output: `export class Base {\n  ${seat("ActiveJob::Base")}\n}`,
    }),
    at(`export class Base {\n  static toString(): string {\n    return this.name;\n  }\n}`, {
      errors: [{ messageId: "handWritten" }],
    }),
  ],
});
