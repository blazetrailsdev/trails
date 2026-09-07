import { RuleTester } from "eslint";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Hermetic fixtures: point the rule at tmp manifest + exclude files via the
// env overrides it reads lazily, so the test never touches the committed one.
const MANIFEST_FIXTURE = path.join(__dirname, ".tmp-rails-error-classes.test.json");
const EXCLUDE_FIXTURE = path.join(__dirname, ".tmp-rails-error-parity-exclude.test.json");

const manifest = {
  generatedAt: "test",
  packages: {
    activerecord: [
      { name: "ActiveRecordError", parent: "StandardError", rubyFile: "active_record/errors.rb" },
      { name: "RecordNotFound", parent: "ActiveRecordError", rubyFile: "active_record/errors.rb" },
      { name: "StatementInvalid", parent: "AdapterError", rubyFile: "active_record/errors.rb" },
    ],
    activesupport: [
      {
        name: "MessageVerifierError",
        parent: "StandardError",
        rubyFile: "active_support/errors.rb",
      },
      // Scattered error class: lives in delegation.rb, not errors.rb.
      {
        name: "DelegationError",
        parent: "NoMethodError",
        rubyFile: "active_support/delegation.rb",
      },
      // Nested scattered class: Ruby's snake_case path maps to our kebab-case
      // source file (core_ext/string/output_safety.rb → core-ext/string/
      // output-safety.ts).
      {
        name: "SafeConcatError",
        parent: "StandardError",
        rubyFile: "active_support/core_ext/string/output_safety.rb",
      },
    ],
  },
};

const excludedRel = "packages/activerecord/src/excluded.ts";

fs.writeFileSync(MANIFEST_FIXTURE, JSON.stringify(manifest, null, 2));
fs.writeFileSync(EXCLUDE_FIXTURE, JSON.stringify([excludedRel], null, 2));
process.env.RAILS_ERROR_CLASSES_PATH = MANIFEST_FIXTURE;
process.env.RAILS_ERROR_PARITY_EXCLUDE_PATH = EXCLUDE_FIXTURE;

process.on("exit", () => {
  fs.rmSync(MANIFEST_FIXTURE, { force: true });
  fs.rmSync(EXCLUDE_FIXTURE, { force: true });
});

// Imported after the env vars are set; the rule resolves the paths lazily so
// ESM hoisting of this import is harmless.
const { default: rule } = await import("./rails-error-parity.mjs");

const errorsFile = path.join(REPO_ROOT, "packages/activerecord/src/errors.ts");
const baseFile = path.join(REPO_ROOT, "packages/activerecord/src/base.ts");
const excludedFile = path.join(REPO_ROOT, excludedRel);
const asErrorsFile = path.join(REPO_ROOT, "packages/activesupport/src/errors.ts");
const asBaseFile = path.join(REPO_ROOT, "packages/activesupport/src/duration.ts");
// Scattered (non-errors.ts) file: DelegationError maps here via delegation.rb.
const asScatteredFile = path.join(REPO_ROOT, "packages/activesupport/src/delegation.ts");
// Nested scattered file: the manifest's snake_case Ruby path must map onto
// this kebab-case source path for the parity check to match it.
const asNestedFile = path.join(
  REPO_ROOT,
  "packages/activesupport/src/core-ext/string/output-safety.ts",
);

// Class declarations for synthetic errors.ts files; `nl` joins into a file.
const AD = "export class AdapterError extends ActiveRecordError {}";
const RNF = "export class RecordNotFound extends ActiveRecordError {}";
const SI = "export class StatementInvalid extends AdapterError {}";
const ARE = "export class ActiveRecordError extends Error {}";
const nl = (...lines) => lines.join("\n") + "\n";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("rails-error-parity", rule, {
  valid: [
    // errors.ts mirrors every manifest class with correct parents.
    { filename: errorsFile, code: nl(ARE, AD, RNF, SI) },
    // Throwing a ported error class is allowed.
    { filename: baseFile, code: `throw new RecordNotFound("nope");\n` },
    // An imported name shadows the global of the same spelling, so a ported
    // `RangeError` throws clean while the native one still reports.
    {
      filename: baseFile,
      code: `import { RangeError } from "./errors.js";\nthrow new RangeError("nope");\n`,
    },
    // Excluded file: bare throw is skipped.
    { filename: excludedFile, code: `throw new Error("bare");\n` },
    // activesupport is in scope: errors.ts mirrors its manifest class.
    {
      filename: asErrorsFile,
      code: `export class MessageVerifierError extends Error {}\n`,
    },
    // Scattered file in scope: DelegationError mirrors its manifest class.
    {
      filename: asScatteredFile,
      code: `export class DelegationError extends Error {}\n`,
    },
    // Nested snake_case→kebab-case path is matched and mirrored.
    {
      filename: asNestedFile,
      code: `export class SafeConcatError extends Error {}\n`,
    },
  ],
  invalid: [
    // Missing class: errors.ts omits RecordNotFound.
    { filename: errorsFile, code: nl(ARE, AD, SI), errors: [{ messageId: "missingClass" }] },
    // Wrong parent: StatementInvalid should extend AdapterError.
    {
      filename: errorsFile,
      code: nl(ARE, AD, RNF, "export class StatementInvalid extends ActiveRecordError {}"),
      errors: [{ messageId: "wrongParent" }],
    },
    // Bare `throw new Error` and `throw new globalThis.Error` are both flagged.
    {
      filename: baseFile,
      code: `throw new Error("boom");\n`,
      errors: [{ messageId: "bareThrow" }],
    },
    {
      filename: baseFile,
      code: `throw new globalThis.Error("boom");\n`,
      errors: [{ messageId: "bareThrow" }],
    },
    // Root class with no `extends` is not an Error subtype — flagged.
    {
      filename: errorsFile,
      code: nl("export class ActiveRecordError {}", AD, RNF, SI),
      errors: [{ messageId: "rootExtends" }],
    },
    // activesupport is in scope: bare throw is flagged there too.
    {
      filename: asBaseFile,
      code: `throw new TypeError("boom");\n`,
      errors: [{ messageId: "bareThrow" }],
    },
    // activesupport is in scope: errors.ts missing its manifest class.
    {
      filename: asErrorsFile,
      code: `export class SomethingElse extends Error {}\n`,
      errors: [{ messageId: "missingClass" }],
    },
    // Scattered file in scope: delegation.ts omits DelegationError.
    {
      filename: asScatteredFile,
      code: `export class SomethingElse extends Error {}\n`,
      errors: [{ messageId: "missingClass" }],
    },
    // Scattered file in scope: DelegationError present but not an Error subtype.
    {
      filename: asScatteredFile,
      code: `export class DelegationError {}\n`,
      errors: [{ messageId: "rootExtends" }],
    },
    // Nested snake_case→kebab-case path is matched: missing class is flagged.
    {
      filename: asNestedFile,
      code: `export class SomethingElse extends Error {}\n`,
      errors: [{ messageId: "missingClass" }],
    },
  ],
});

console.log("rails-error-parity: ok");
