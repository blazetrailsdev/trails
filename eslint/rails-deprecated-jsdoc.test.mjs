import { RuleTester } from "eslint";
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Hermetic fixture: point the rule at a tmp manifest via the env override it
// reads lazily, so the test never touches the committed one. Writing the
// fixture to the real path and restoring it from `process.on("exit")` is what
// this used to do, and vitest workers do not reliably run that handler — the
// fixture survived the run as a silent, strictly-smaller manifest.
const MANIFEST_FIXTURE = path.join(__dirname, ".tmp-rails-deprecated-methods.test.json");
const fixture = {
  files: {
    "packages/activerecord/src/connection-handling.ts": ["connection"],
  },
};
fs.writeFileSync(MANIFEST_FIXTURE, JSON.stringify(fixture, null, 2));
process.env.RAILS_DEPRECATED_METHODS_PATH = MANIFEST_FIXTURE;
process.on("exit", () => fs.rmSync(MANIFEST_FIXTURE, { force: true }));

// Imported after the env var is set; the rule resolves the path lazily so ESM
// hoisting of this import is harmless.
const { default: rule } = await import("./rails-deprecated-jsdoc.mjs");

const connFile = path.join(REPO_ROOT, "packages/activerecord/src/connection-handling.ts");

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("rails-deprecated-jsdoc", rule, {
  valid: [
    // Already tagged.
    {
      filename: connFile,
      code: `/** @deprecated */\nexport function connection() {}\n`,
    },
    // Name not in manifest.
    {
      filename: connFile,
      code: `export function notADeprecatedName() {}\n`,
    },
    // Already tagged inside multi-line JSDoc.
    {
      filename: connFile,
      code: `/**\n * Doc.\n * @deprecated\n */\nexport function connection() {}\n`,
    },
    // Interface method (TSMethodSignature) already tagged.
    {
      filename: connFile,
      code: `interface Adapters {\n  /** @deprecated */\n  connection(): unknown;\n}\n`,
    },
  ],
  invalid: [
    // Missing tag, no JSDoc — insert a fresh block.
    {
      filename: connFile,
      code: `export function connection() {}\n`,
      errors: [{ messageId: "missingDeprecated" }],
      output: `/** @deprecated */\nexport function connection() {}\n`,
    },
    // Missing tag, existing JSDoc — append @deprecated.
    {
      filename: connFile,
      code: `/**\n * Does a thing.\n */\nexport function connection() {}\n`,
      errors: [{ messageId: "missingDeprecated" }],
      output: `/**\n * Does a thing.\n *\n * @deprecated\n */\nexport function connection() {}\n`,
    },
    // Class method with no JSDoc.
    {
      filename: connFile,
      code: `class Base {\n  connection() {}\n}\n`,
      errors: [{ messageId: "missingDeprecated" }],
      output: `class Base {\n  /** @deprecated */\n  connection() {}\n}\n`,
    },
    // Single-line JSDoc must be expanded into a multi-line block, not
    // mangled into `/** Foo *\n * @deprecated\n */`.
    {
      filename: connFile,
      code: `/** Returns the adapter. */\nexport function connection() {}\n`,
      errors: [{ messageId: "missingDeprecated" }],
      output: `/**\n * Returns the adapter.\n *\n * @deprecated\n */\nexport function connection() {}\n`,
    },
    // A non-adjacent file header must NOT be treated as the node's JSDoc —
    // autofix should add a fresh block, not splice into the header.
    {
      filename: connFile,
      code: `/** File header. */\n\nexport function connection() {}\n`,
      errors: [{ messageId: "missingDeprecated" }],
      output: `/** File header. */\n\n/** @deprecated */\nexport function connection() {}\n`,
    },
    // Interface method (TSMethodSignature) with no JSDoc — this is the
    // branch that tags `unsignedFloat`/`unsignedDecimal` on the
    // `ColumnMethods` interface in mysql/schema-definitions.ts.
    {
      filename: connFile,
      code: `interface Adapters {\n  connection(): unknown;\n}\n`,
      errors: [{ messageId: "missingDeprecated" }],
      output: `interface Adapters {\n  /** @deprecated */\n  connection(): unknown;\n}\n`,
    },
  ],
});

describe("rails-deprecated-jsdoc manifest fixture", () => {
  it("leaves the committed manifest untouched", () => {
    // The fixture used to be written OVER eslint/rails-deprecated-methods.json and
    // restored from a `process.on("exit")` handler, which vitest workers do not
    // reliably run — the fixture survived the run as a silent, strictly-smaller
    // manifest and was swept into unrelated PRs by `git add -A`. Reading the real
    // file here fails the moment the rule stops honoring the env override.
    const committed = JSON.parse(
      fs.readFileSync(path.join(__dirname, "rails-deprecated-methods.json"), "utf8"),
    );
    expect(Object.keys(committed.files)).toContain(
      "packages/activerecord/src/connection-adapters/mysql/schema-definitions.ts",
    );
  });
});

console.log("rails-deprecated-jsdoc: ok");
