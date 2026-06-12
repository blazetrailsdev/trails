import { RuleTester } from "eslint";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Hermetic fixtures: point the rule at tmp manifest + exclude files via the
// env overrides it reads lazily, so the test never depends on the committed
// generated manifest and never mutates it.
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

// A full, correct errors.ts mirroring the fixture manifest.
const goodErrors = [
  `export class ActiveRecordError extends Error {}`,
  `export class AdapterError extends ActiveRecordError {}`,
  `export class RecordNotFound extends ActiveRecordError {}`,
  `export class StatementInvalid extends AdapterError {}`,
  ``,
].join("\n");

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
    { filename: errorsFile, code: goodErrors },
    // Throwing a ported error class is allowed.
    {
      filename: baseFile,
      code: `import { RecordNotFound } from "./errors.js";\nthrow new RecordNotFound("nope");\n`,
    },
    // Excluded file: bare throw is skipped.
    { filename: excludedFile, code: `throw new Error("bare");\n` },
  ],
  invalid: [
    // Missing class: errors.ts omits RecordNotFound.
    {
      filename: errorsFile,
      code: [
        `export class ActiveRecordError extends Error {}`,
        `export class AdapterError extends ActiveRecordError {}`,
        `export class StatementInvalid extends AdapterError {}`,
        ``,
      ].join("\n"),
      errors: [{ messageId: "missingClass" }],
    },
    // Wrong parent: StatementInvalid should extend AdapterError.
    {
      filename: errorsFile,
      code: [
        `export class ActiveRecordError extends Error {}`,
        `export class AdapterError extends ActiveRecordError {}`,
        `export class RecordNotFound extends ActiveRecordError {}`,
        `export class StatementInvalid extends ActiveRecordError {}`,
        ``,
      ].join("\n"),
      errors: [{ messageId: "wrongParent" }],
    },
    // Bare `throw new Error` in Rails-mirroring source.
    {
      filename: baseFile,
      code: `throw new Error("boom");\n`,
      errors: [{ messageId: "bareThrow" }],
    },
    // Other global error constructors are flagged too.
    {
      filename: baseFile,
      code: `throw new TypeError("boom");\n`,
      errors: [{ messageId: "bareThrow" }],
    },
  ],
});

console.log("rails-error-parity: ok");
