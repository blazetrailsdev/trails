import { RuleTester } from "eslint";
import * as path from "path";
import { fileURLToPath } from "url";
import rule from "./unbacked-internal-needs-receipt.mjs";
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
  },
};
setManifestForTests(FIXTURE);
const inheritanceFile = path.join(REPO_ROOT, "packages/activerecord/src/inheritance.ts");
const baseFile = path.join(REPO_ROOT, "packages/activerecord/src/base.ts");

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("unbacked-internal-needs-receipt", rule, {
  valid: [
    // The Rails counterpart IS private: `@internal` alone is the right tag.
    {
      filename: inheritanceFile,
      code: `/** @internal */\nexport function computeType() {}\n`,
    },
    // Unbacked, but carries the receipt.
    {
      filename: inheritanceFile,
      code: `/**\n * @internal\n * @noRailsEquivalent PERMANENT — a language fact.\n */\nexport function seam() {}\n`,
    },
    // A file-level receipt above the imports covers every name in the file.
    {
      filename: inheritanceFile,
      code: `/**\n * @noRailsEquivalent PERMANENT — no Rails file maps onto this one.\n */\nimport { x } from "./x.js";\n\n/** @internal */\nexport function seam() {}\n`,
    },
    // `_`-prefixed names are dropped from the measured surface by name alone.
    {
      filename: inheritanceFile,
      code: `/** @internal */\nexport function _seam() {}\n`,
    },
    // A non-exported file-local helper is internal from its lack of an export.
    {
      filename: inheritanceFile,
      code: `/** @internal */\nfunction seam() {}\nseam();\n`,
    },
    // Interface members are exempt by kind in parity:api:extra.
    {
      filename: inheritanceFile,
      code: `export interface Host {\n  /** @internal */\n  seam(): void;\n}\n`,
    },
    // The class member's name IS in the manifest for this file.
    {
      filename: baseFile,
      code: `class Base {\n  /** @internal */\n  static computeType() {}\n}\n`,
    },
  ],
  invalid: [
    // Exported function, `@internal`, absent from the manifest.
    {
      filename: inheritanceFile,
      code: `/** @internal */\nexport function seam() {}\n`,
      errors: [{ messageId: "unbackedInternal" }],
    },
    // Same, in a file the manifest does not cover at all.
    {
      filename: path.join(REPO_ROOT, "packages/trailties/src/engine.ts"),
      code: `/** @internal */\nexport function seam() {}\n`,
      errors: [{ messageId: "unbackedInternal" }],
    },
    // Public class method.
    {
      filename: baseFile,
      code: `class Base {\n  /** @internal */\n  static seam() {}\n}\n`,
      errors: [{ messageId: "unbackedInternal" }],
    },
    // A file header separated by a blank line is NOT the declaration's JSDoc,
    // and a file-level receipt is read only above an import.
    {
      filename: inheritanceFile,
      code: `/**\n * @noRailsEquivalent PERMANENT — a header, not a file-level tag.\n */\n\n/** @internal */\nexport function seam() {}\n`,
      errors: [{ messageId: "unbackedInternal" }],
    },
  ],
});

// The standalone Lint job builds the manifest with `--allow-missing` and there
// is no Ruby there, so the file is genuinely absent. This rule's polarity turns
// "no manifest" into "every `@internal` is unbacked" unless it fails open —
// which is how it reported 4 false positives on names that ARE Rails-private.
tester.run("unbacked-internal-needs-receipt (no manifest)", rule, {
  valid: [
    {
      filename: inheritanceFile,
      code: `/** @internal */\nexport function seam() {}\n`,
      // Scoped to this case: the manifest cache is module-global, and
      // RuleTester runs every case after the module body, so setting it at
      // import time would silently apply to the suite above too.
      before: () => setManifestForTests(null),
      after: () => setManifestForTests(FIXTURE),
    },
  ],
  invalid: [],
});

console.log("unbacked-internal-needs-receipt: ok");
