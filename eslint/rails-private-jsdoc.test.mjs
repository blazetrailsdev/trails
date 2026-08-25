import { RuleTester } from "eslint";
import * as path from "path";
import { fileURLToPath } from "url";
import rule from "./rails-private-jsdoc.mjs";
import { setManifestForTests } from "./rails-private-jsdoc.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const FIXTURE = {
  files: {
    // base.ts also lists computeType — the manifest builder adds it via
    // include-graph resolution (Rails Base extends Inheritance::ClassMethods
    // through the Concern `included` hook). Both rules just do a file-scoped
    // lookup.
    "packages/activerecord/src/inheritance.ts": ["computeType"],
    "packages/activerecord/src/base.ts": ["computeType"],
    // Rails' `Rack::Lock` declares a private `unlock` (rack/lib/rack/lock.rb);
    // lock.ts also hosts a local `Mutex` protocol whose `unlock` mirrors the
    // PUBLIC stdlib `Mutex#unlock`.
    "packages/rack/src/lock.ts": ["unlock"],
  },
  entities: {
    "packages/rack/src/lock.ts": ["Lock", "Rack"],
  },
};
setManifestForTests(FIXTURE);
const inheritanceFile = path.join(REPO_ROOT, "packages/activerecord/src/inheritance.ts");
const baseFile = path.join(REPO_ROOT, "packages/activerecord/src/base.ts");
const lockFile = path.join(REPO_ROOT, "packages/rack/src/lock.ts");

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("rails-private-jsdoc", rule, {
  valid: [
    // Already tagged.
    {
      filename: inheritanceFile,
      code: `/** @internal */\nexport function computeType() {}\n`,
    },
    // Name not in manifest.
    {
      filename: inheritanceFile,
      code: `export function notARailsName() {}\n`,
    },
    // Already tagged inside multi-line JSDoc.
    {
      filename: inheritanceFile,
      code: `/**\n * Doc.\n * @internal\n */\nexport function computeType() {}\n`,
    },
    // A class Rails does not have: `entities` lists only `Lock` for this file,
    // so `DefaultMutex#unlock` is not gated by `Rack::Lock`'s private `unlock`.
    {
      filename: lockFile,
      code: `class DefaultMutex {\n  unlock() {}\n}\n`,
    },
    // Same for a local protocol interface's method signature.
    {
      filename: lockFile,
      code: `interface Mutex {\n  unlock(): void;\n}\n`,
    },
    // Class method that's already tagged.
    {
      filename: baseFile,
      code: `class Base {\n  /** @internal */\n  static computeType() {}\n}\n`,
    },
  ],
  invalid: [
    // The entity Rails DOES have in that file is still gated.
    {
      filename: lockFile,
      code: `class Lock {\n  unlock() {}\n}\n`,
      errors: [{ messageId: "missingInternal" }],
      output: `class Lock {\n  /** @internal */\n  unlock() {}\n}\n`,
    },
    // File-scoped match: function with no JSDoc.
    {
      filename: inheritanceFile,
      code: `export function computeType() {}\n`,
      errors: [{ messageId: "missingInternal" }],
      output: `/** @internal */\nexport function computeType() {}\n`,
    },
    // File-scoped match: function with existing JSDoc — append @internal.
    {
      filename: inheritanceFile,
      code: `/**\n * Does a thing.\n */\nexport function computeType() {}\n`,
      errors: [{ messageId: "missingInternal" }],
      output: `/**\n * Does a thing.\n *\n * @internal\n */\nexport function computeType() {}\n`,
    },
    // Package-global match: static method on a class in base.ts (whose
    // host file isn't the Ruby source of `compute_type`).
    {
      filename: baseFile,
      code: `class Base {\n  static computeType() {}\n}\n`,
      errors: [{ messageId: "missingInternal" }],
      output: `class Base {\n  /** @internal */\n  static computeType() {}\n}\n`,
    },
    // Single-line JSDoc must be expanded into a multi-line block, not
    // mangled into `/** Foo *\n * @internal\n */`.
    {
      filename: inheritanceFile,
      code: `/** Resolve a name. */\nexport function computeType() {}\n`,
      errors: [{ messageId: "missingInternal" }],
      output: `/**\n * Resolve a name.\n *\n * @internal\n */\nexport function computeType() {}\n`,
    },
    // A non-adjacent file header must NOT be treated as the node's
    // JSDoc — autofix should add a fresh `/** @internal */` instead of
    // splicing into the header.
    {
      filename: inheritanceFile,
      code: `/** File header. */\n\nexport function computeType() {}\n`,
      errors: [{ messageId: "missingInternal" }],
      output: `/** File header. */\n\n/** @internal */\nexport function computeType() {}\n`,
    },
  ],
});

console.log("rails-private-jsdoc: ok");
