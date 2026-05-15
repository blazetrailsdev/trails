import { RuleTester } from "eslint";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import rule from "./rails-method-order.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(__dirname, "rails-method-order.json");

const hadExisting = fs.existsSync(MANIFEST_PATH);
const original = hadExisting ? fs.readFileSync(MANIFEST_PATH, "utf8") : null;
const fixture = {
  files: {
    "packages/arel/src/fixture-class.ts": ["first", "second", "third"],
    "packages/arel/src/fixture-fns.ts": ["alpha", "beta", "gamma"],
    "packages/arel/src/fixture-mixed.ts": ["one", "two"],
  },
};
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(fixture, null, 2));
process.on("exit", () => {
  if (hadExisting) fs.writeFileSync(MANIFEST_PATH, original);
  else fs.rmSync(MANIFEST_PATH, { force: true });
});

const classFile = path.join(REPO_ROOT, "packages/arel/src/fixture-class.ts");
const fnFile = path.join(REPO_ROOT, "packages/arel/src/fixture-fns.ts");
const mixedFile = path.join(REPO_ROOT, "packages/arel/src/fixture-mixed.ts");
const unlistedFile = path.join(REPO_ROOT, "packages/arel/src/fixture-unlisted.ts");

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("rails-method-order", rule, {
  valid: [
    // File not in manifest.
    {
      filename: unlistedFile,
      code: `class X { b() {} a() {} }\n`,
    },
    // Already in expected order.
    {
      filename: classFile,
      code: `class X {\n  first() {}\n  second() {}\n  third() {}\n}\n`,
    },
    // Unmapped helper trails the mapped block in current order.
    {
      filename: classFile,
      code: `class X {\n  first() {}\n  second() {}\n  third() {}\n  helper() {}\n}\n`,
    },
    // Top-level functions in expected order.
    {
      filename: fnFile,
      code: `export function alpha() {}\nexport function beta() {}\nexport function gamma() {}\n`,
    },
    // Single member — nothing to reorder.
    {
      filename: classFile,
      code: `class X { first() {} }\n`,
    },
  ],
  invalid: [
    // Class methods out of order.
    {
      filename: classFile,
      code: `class X {\n  third() {}\n  first() {}\n  second() {}\n}\n`,
      errors: [{ messageId: "outOfOrder" }],
      output: `class X {\n  first() {}\n  second() {}\n  third() {}\n}\n`,
    },
    // Unmapped helper stays at the end after reordering.
    {
      filename: classFile,
      code: `class X {\n  helper() {}\n  third() {}\n  first() {}\n}\n`,
      errors: [{ messageId: "outOfOrder" }],
      output: `class X {\n  first() {}\n  third() {}\n  helper() {}\n}\n`,
    },
    // Top-level function reordering.
    {
      filename: fnFile,
      code: `export function gamma() {}\nexport function alpha() {}\nexport function beta() {}\n`,
      errors: [{ messageId: "outOfOrder" }],
      output: `export function alpha() {}\nexport function beta() {}\nexport function gamma() {}\n`,
    },
    // JSDoc travels with the method on reorder.
    {
      filename: classFile,
      code:
        `class X {\n` +
        `  /** doc for second */\n` +
        `  second() {}\n` +
        `  /** doc for first */\n` +
        `  first() {}\n` +
        `}\n`,
      errors: [{ messageId: "outOfOrder" }],
      output:
        `class X {\n` +
        `  /** doc for first */\n` +
        `  first() {}\n` +
        `  /** doc for second */\n` +
        `  second() {}\n` +
        `}\n`,
    },
  ],
});

console.log("rails-method-order tests passed");
