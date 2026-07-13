import { RuleTester } from "eslint";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Hermetic fixtures: point the rule at tmp manifest + exclude files via the
// env overrides it reads lazily, so the test never touches the committed one.
const MANIFEST_FIXTURE = path.join(__dirname, ".tmp-rails-callback-invocations.test.json");
const EXCLUDE_FIXTURE = path.join(__dirname, ".tmp-rails-callback-invocations-exclude.test.json");

const manifest = {
  methods: {
    destroy: ["destroy"],
    createOrUpdate: ["save"],
    initWithAttributes: ["find", "initialize"],
  },
};

const excludedRel = "packages/activerecord/src/grandfathered.ts";

fs.writeFileSync(MANIFEST_FIXTURE, JSON.stringify(manifest, null, 2));
fs.writeFileSync(EXCLUDE_FIXTURE, JSON.stringify([`${excludedRel}#destroy`], null, 2));
process.env.RAILS_CALLBACK_INVOCATIONS_PATH = MANIFEST_FIXTURE;
process.env.RAILS_CALLBACK_INVOCATIONS_EXCLUDE_PATH = EXCLUDE_FIXTURE;

process.on("exit", () => {
  fs.rmSync(MANIFEST_FIXTURE, { force: true });
  fs.rmSync(EXCLUDE_FIXTURE, { force: true });
});

// Imported after the env vars are set; the rule resolves the paths lazily so
// ESM hoisting of this import is harmless.
const { default: rule } = await import("./rails-callback-invocations.mjs");

const srcFile = path.join(REPO_ROOT, "packages/activerecord/src/persistence.ts");
const excludedFile = path.join(REPO_ROOT, excludedRel);
const outOfScopeFile = path.join(REPO_ROOT, "packages/activemodel/src/callbacks.ts");

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("rails-callback-invocations", rule, {
  valid: [
    // Matching method that fires the required callback — passes.
    {
      filename: srcFile,
      code: `export function destroy(this: any) { return this.runCallbacks("destroy", () => {}); }\n`,
    },
    // runAllCallbacks is accepted as the callback-firing equivalent.
    {
      filename: srcFile,
      code: `export function createOrUpdate(this: any) { return runAllCallbacks(this, "save", () => {}); }\n`,
    },
    // All required events present (multi-event method).
    {
      filename: srcFile,
      code:
        `export function initWithAttributes(this: any) {\n` +
        `  this.runCallbacks("find");\n` +
        `  this.runCallbacks("initialize");\n` +
        `}\n`,
    },
    // Method as a class method definition, firing the callback.
    {
      filename: srcFile,
      code: `class Foo { destroy() { return this.runCallbacks("destroy"); } }\n`,
    },
    // Non-matching method name — not in the manifest, so never checked even
    // though it fires no callbacks.
    {
      filename: srcFile,
      code: `export function save(this: any) { return this._createOrUpdate(); }\n`,
    },
    // Excluded (grandfathered) file+method pair — flagged pair is skipped.
    {
      filename: excludedFile,
      code: `export function destroy(this: any) { return this._reallyDestroy(); }\n`,
    },
    // Out-of-scope package — rule does not apply.
    {
      filename: outOfScopeFile,
      code: `export function destroy(this: any) { return this._reallyDestroy(); }\n`,
    },
  ],
  invalid: [
    // Matching method missing the callback invocation — flagged.
    {
      filename: srcFile,
      code: `export function destroy(this: any) { return this._reallyDestroy(); }\n`,
      errors: [{ messageId: "missingCallback", data: { name: "destroy", event: "destroy" } }],
    },
    // Multi-event method firing only one required event — flags the missing one.
    {
      filename: srcFile,
      code: `export function initWithAttributes(this: any) { this.runCallbacks("find"); }\n`,
      errors: [
        { messageId: "missingCallback", data: { name: "initWithAttributes", event: "initialize" } },
      ],
    },
  ],
});
