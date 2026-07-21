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
// Order data is keyed per container: `classes[Name]` per class, `functions`
// for top-level functions. `fixture-class.ts` gives the same order to every
// class name the tests use (X / A / B / Outer); `fixture-multi.ts` gives two
// classes OPPOSITE orders to exercise per-class keying (the casted.rb
// Casted/Quoted case a flat per-file list could not express).
const sharedClassOrder = ["first", "second", "third"];
const fixture = {
  files: {
    "packages/arel/src/fixture-class.ts": {
      classes: {
        X: sharedClassOrder,
        A: sharedClassOrder,
        B: sharedClassOrder,
        Outer: sharedClassOrder,
      },
      functions: [],
    },
    "packages/arel/src/fixture-fns.ts": {
      classes: {},
      functions: ["alpha", "beta", "gamma"],
    },
    "packages/arel/src/fixture-multi.ts": {
      classes: { Casted: ["before", "database"], Quoted: ["database", "before"] },
      functions: [],
    },
    // Bucket key `Integer` (the Rails constant) has no class named `Integer`;
    // the 1:1 rename fallback pairs it with the sole class body (`IntegerType`).
    "packages/arel/src/fixture-rename.ts": {
      classes: { Integer: sharedClassOrder },
      functions: [],
    },
    // Two buckets, neither exact-matching a class name → ambiguous, so the
    // fallback must NOT pair; both classes stay unordered.
    "packages/arel/src/fixture-ambiguous.ts": {
      classes: { Foo: sharedClassOrder, Bar: sharedClassOrder },
      functions: [],
    },
    // Single 1/1 unmatched shape, but the bucket name is neither a substring of
    // the TS class name nor vice versa → no identity evidence, so the fallback
    // must NOT pair (guards a TS-only helper class from a never-ported bucket).
    "packages/arel/src/fixture-noevidence.ts": {
      classes: { Zzz: sharedClassOrder },
      functions: [],
    },
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
const multiFile = path.join(REPO_ROOT, "packages/arel/src/fixture-multi.ts");
const renameFile = path.join(REPO_ROOT, "packages/arel/src/fixture-rename.ts");
const ambiguousFile = path.join(REPO_ROOT, "packages/arel/src/fixture-ambiguous.ts");
const noEvidenceFile = path.join(REPO_ROOT, "packages/arel/src/fixture-noevidence.ts");

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
      // Per-class keying: two classes in one file with members sharing
      // names but in OPPOSITE Rails order. A flat per-file list forced one
      // order on both (the casted.rb bug); per-class keying lets each pass
      // in its own order. Here `Casted` wants before→database and `Quoted`
      // wants database→before, and both are already correct.
      {
        filename: multiFile,
        code:
          `class Casted {\n  before() {}\n  database() {}\n}\n` +
          `class Quoted {\n  database() {}\n  before() {}\n}\n`,
      },
      // Ambiguity guard: two manifest buckets, neither matching a class
      // name by exact spelling. The 1:1 rename fallback only fires when
      // exactly one bucket AND one class remain unmatched, so here it must
      // NOT pair — both classes stay unordered even though out of order.
      {
        filename: ambiguousFile,
        code:
          `class Xyz {\n  third() {}\n  first() {}\n}\n` +
          `class Zzz {\n  third() {}\n  first() {}\n}\n`,
      },
      // Identity guard: exactly one class body and one bucket unmatched, but
      // `Zzz` is not a substring of `Helper` (nor vice versa). No evidence they
      // are the same entity → the 1/1 fallback must NOT pair, so the class
      // stays unordered even though its members are out of manifest order.
      {
        filename: noEvidenceFile,
        code: `class Helper {\n  third() {}\n  first() {}\n}\n`,
      },
      // Class nested inside a function body is not reordered. If we
      // also reordered the outer function (it has 0 siblings here so
      // we don't), the nested class members' fix ranges would overlap
      // the function's fix range and ESLint would throw. Skipping
      // non-top-level classes avoids the conflict and matches the
      // file-structure intent (top-of-file mirroring, not deep AST).
      {
        filename: classFile,
        code:
          `export function mkClass() {\n` +
          `  return class {\n` +
          `    third() {}\n` +
          `    first() {}\n` +
          `    second() {}\n` +
          `  };\n` +
          `}\n`,
      },
      // Class nested inside an arrow function — also rejected. The
      // ancestor walk catches ArrowFunctionExpression too.
      {
        filename: classFile,
        code: `const mk = () => class {\n  third() {}\n  first() {}\n  second() {}\n};\n`,
      },
      // Class nested inside another class's method — also rejected.
      // The ancestor walk hits a function-like node (the method's
      // FunctionExpression, then MethodDefinition) on the way up to
      // Program and short-circuits.
      {
        filename: classFile,
        code:
          `class Outer {\n` +
          `  build() {\n` +
          `    return class {\n` +
          `      third() {}\n` +
          `      first() {}\n` +
          `      second() {}\n` +
          `    };\n` +
          `  }\n` +
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
      // TS function overload signatures (TSDeclareFunction) travel
      // with their implementation. Separating them would produce
      // TS2389 ("Function implementation name must be 'foo'").
      // Same-name grouping in computeTargetOrder keeps the
      // signature(s) + implementation adjacent across a reorder.
      {
        filename: fnFile,
        code:
          `export function beta(x: string): string;\n` +
          `export function beta(x: number): number;\n` +
          `export function beta(x: any): any { return x; }\n` +
          `export function alpha(): void {}\n` +
          `export function gamma(): void {}\n`,
        errors: [{ messageId: "outOfOrder" }],
        output:
          `export function alpha(): void {}\n` +
          `export function beta(x: string): string;\n` +
          `export function beta(x: number): number;\n` +
          `export function beta(x: any): any { return x; }\n` +
          `export function gamma(): void {}\n`,
      },
      // Class methods out of order.
      {
        filename: classFile,
        code: `class X {\n  third() {}\n  first() {}\n  second() {}\n}\n`,
        errors: [{ messageId: "outOfOrder" }],
        output: `class X {\n  first() {}\n  second() {}\n  third() {}\n}\n`,
      },
      // `const X = class { … }` — class expression bound to a
      // top-level variable. Reachable from Program through
      // VariableDeclarator / VariableDeclaration with no function-like
      // ancestor between, so it's still file-level structure and gets
      // reordered.
      {
        filename: classFile,
        code: `const X = class {\n  third() {}\n  first() {}\n  second() {}\n};\n`,
        errors: [{ messageId: "outOfOrder" }],
        output: `const X = class {\n  first() {}\n  second() {}\n  third() {}\n};\n`,
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
      // Per-class keying, both classes out of order: `Casted` reorders to
      // before→database while `Quoted` reorders to database→before, from the
      // same file. Impossible with a flat per-file list.
      {
        filename: multiFile,
        code:
          `class Casted {\n  database() {}\n  before() {}\n}\n` +
          `class Quoted {\n  before() {}\n  database() {}\n}\n`,
        errors: [{ messageId: "outOfOrder" }],
        output:
          `class Casted {\n  before() {}\n  database() {}\n}\n` +
          `class Quoted {\n  database() {}\n  before() {}\n}\n`,
      },
      // Rename fallback: the manifest bucket is keyed `Integer` (the Rails
      // constant) but trails named the class `IntegerType`. With one bucket
      // and one class both unmatched, the 1:1 fallback pairs them and the
      // class is reordered to the bucket's Rails order.
      {
        filename: renameFile,
        code: `class IntegerType {\n  third() {}\n  first() {}\n  second() {}\n}\n`,
        errors: [{ messageId: "outOfOrder" }],
        output: `class IntegerType {\n  first() {}\n  second() {}\n  third() {}\n}\n`,
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
