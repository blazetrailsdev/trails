import { RuleTester } from "eslint";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import rule from "./rails-file-structure-method-order.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(__dirname, "rails-file-structure-method-order.json");

const hadExisting = fs.existsSync(MANIFEST_PATH);
const original = hadExisting ? fs.readFileSync(MANIFEST_PATH, "utf8") : null;
const fixture = {
  files: {
    "packages/arel/src/fixture-class.ts": ["first", "second", "third"],
    "packages/arel/src/fixture-fns.ts": ["alpha", "beta", "gamma"],
    "packages/arel/src/fixture-mixed.ts": ["one", "two"],
  },
};
function restoreManifest() {
  if (hadExisting) fs.writeFileSync(MANIFEST_PATH, original);
  else fs.rmSync(MANIFEST_PATH, { force: true });
}
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(fixture, null, 2));
// Fallback restore — covers process crash mid-test. The primary
// restoration lives in the try/finally around `tester.run(...)` below
// so we don't leak the fixture manifest into sibling test files when
// Vitest reuses a worker process across files.
process.on("exit", restoreManifest);

const classFile = path.join(REPO_ROOT, "packages/arel/src/fixture-class.ts");
const fnFile = path.join(REPO_ROOT, "packages/arel/src/fixture-fns.ts");
const unlistedFile = path.join(REPO_ROOT, "packages/arel/src/fixture-unlisted.ts");

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

try {
  tester.run("rails-file-structure-method-order", rule, {
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
      // File-level opt-out via @rails-structure-skip JSDoc.
      {
        filename: classFile,
        code: `/** @rails-structure-skip reason="legacy" */\nclass X {\n  third() {}\n  first() {}\n  second() {}\n}\n`,
      },
      // Method-level @rails-structure-skip JSDoc does NOT suppress the
      // whole file — only leading-comment-block markers count. This case
      // has the marker on a method's JSDoc; the class is still in-order
      // so it's valid (no-fix expected anyway).
      {
        filename: classFile,
        code:
          `class X {\n` +
          `  first() {}\n` +
          `  /** @rails-structure-skip reason="method only" */\n` +
          `  second() {}\n` +
          `  third() {}\n` +
          `}\n`,
      },
      // Hoisting-scope safety: ClassDeclaration and `const`/`let` are NOT
      // orderable. A file with only those declarations (no
      // MethodDefinition or FunctionDeclaration) emits no diagnostic,
      // even when names would be out of order per the manifest. Guards
      // against accidental TDZ-risking moves if the rule is later
      // widened.
      {
        filename: fnFile,
        code: `export const gamma = () => {};\nexport const alpha = () => {};\nexport const beta = () => {};\n`,
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
      // Method-level @rails-structure-skip JSDoc must NOT suppress the
      // whole file — even though the marker is present, it sits inside
      // the class body (after the first non-comment token), so the rule
      // still fires on the out-of-order members.
      {
        filename: classFile,
        code:
          `class X {\n` +
          `  /** @rails-structure-skip reason="method only" */\n` +
          `  third() {}\n` +
          `  first() {}\n` +
          `  second() {}\n` +
          `}\n`,
        errors: [{ messageId: "outOfOrder" }],
        output:
          `class X {\n` +
          `  first() {}\n` +
          `  second() {}\n` +
          `  /** @rails-structure-skip reason="method only" */\n` +
          `  third() {}\n` +
          `}\n`,
      },
      // Constructor carve-out: even when `constructor` is NOT in the
      // manifest (e.g. Rails Struct subclass with no explicit
      // initialize), it pins to the top of the class rather than falling
      // into the unmapped tail.
      {
        filename: classFile,
        code:
          `class X {\n` +
          `  first() {}\n` +
          `  third() {}\n` +
          `  constructor() {}\n` +
          `  second() {}\n` +
          `}\n`,
        errors: [{ messageId: "outOfOrder" }],
        output:
          `class X {\n` +
          `  constructor() {}\n` +
          `  first() {}\n` +
          `  second() {}\n` +
          `  third() {}\n` +
          `}\n`,
      },
      // Duplicate-named members (getter/setter pairs, TS overload
      // signatures) stay grouped under reorder. The manifest lists each
      // name once; all same-named nodes travel together to that position.
      {
        filename: classFile,
        code:
          `class X {\n` +
          `  get third() { return 3; }\n` +
          `  set third(v) {}\n` +
          `  get first() { return 1; }\n` +
          `  set first(v) {}\n` +
          `  get second() { return 2; }\n` +
          `  set second(v) {}\n` +
          `}\n`,
        errors: [{ messageId: "outOfOrder" }],
        output:
          `class X {\n` +
          `  get first() { return 1; }\n` +
          `  set first(v) {}\n` +
          `  get second() { return 2; }\n` +
          `  set second(v) {}\n` +
          `  get third() { return 3; }\n` +
          `  set third(v) {}\n` +
          `}\n`,
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
      // Line `//` comment block travels with the method.
      {
        filename: classFile,
        code:
          `class X {\n` +
          `  // line comment for second\n` +
          `  // continued\n` +
          `  second() {}\n` +
          `  // line comment for first\n` +
          `  first() {}\n` +
          `}\n`,
        errors: [{ messageId: "outOfOrder" }],
        output:
          `class X {\n` +
          `  // line comment for first\n` +
          `  first() {}\n` +
          `  // line comment for second\n` +
          `  // continued\n` +
          `  second() {}\n` +
          `}\n`,
      },
      // Multi-class file: each ClassBody is reordered independently using
      // the same manifest list. Names not in this container's manifest
      // intersection stay put.
      {
        filename: classFile,
        code:
          `class A {\n  second() {}\n  first() {}\n}\n` +
          `class B {\n  third() {}\n  second() {}\n}\n`,
        errors: [{ messageId: "outOfOrder" }],
        output:
          `class A {\n  first() {}\n  second() {}\n}\n` +
          `class B {\n  second() {}\n  third() {}\n}\n`,
      },
      // Section header separated by one blank line travels with the
      // next method.
      {
        filename: classFile,
        code:
          `class X {\n` +
          `  third() {}\n\n` +
          `  // -- section header --\n\n` +
          `  first() {}\n\n` +
          `  second() {}\n` +
          `}\n`,
        errors: [{ messageId: "outOfOrder" }],
        output:
          `class X {\n` +
          `  // -- section header --\n\n` +
          `  first() {}\n\n` +
          `  second() {}\n\n` +
          `  third() {}\n` +
          `}\n`,
      },
      // Blank line between methods is preserved across reorder.
      {
        filename: classFile,
        code: `class X {\n  second() {}\n\n  first() {}\n}\n`,
        errors: [{ messageId: "outOfOrder" }],
        output: `class X {\n  first() {}\n\n  second() {}\n}\n`,
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
} finally {
  restoreManifest();
}

console.log("rails-file-structure-method-order tests passed");
