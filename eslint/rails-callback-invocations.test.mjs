import { RuleTester } from "eslint";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Hermetic fixture: point the rule at a tmp manifest via the env override it
// reads lazily, so the test never touches the committed one.
const MANIFEST_FIXTURE = path.join(__dirname, ".tmp-rails-callback-invocations.test.json");

// Manifest keys are file-qualified `<repo-rel path>#<method>` so a requirement
// only lands on the specific ported method whose Rails source fires the
// callback — a same-named method in another file is not constrained.
const srcRel = "packages/activerecord/src/persistence.ts";
const manifest = {
  methods: {
    [`${srcRel}#destroy`]: ["destroy"],
    [`${srcRel}#createOrUpdate`]: ["save"],
    [`${srcRel}#initWithAttributes`]: ["find", "initialize"],
  },
};

fs.writeFileSync(MANIFEST_FIXTURE, JSON.stringify(manifest, null, 2));
process.env.RAILS_CALLBACK_INVOCATIONS_PATH = MANIFEST_FIXTURE;

process.on("exit", () => {
  fs.rmSync(MANIFEST_FIXTURE, { force: true });
});

// Imported after the env var is set; the rule resolves the path lazily so
// ESM hoisting of this import is harmless.
const { default: rule } = await import("./rails-callback-invocations.mjs");

const srcFile = path.join(REPO_ROOT, "packages/activerecord/src/persistence.ts");
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
    // File-scoped lookup: a same-named method in a different in-scope file has
    // no `<rel>#destroy` entry, so it is not constrained despite firing nothing.
    {
      filename: path.join(REPO_ROOT, "packages/activerecord/src/relation.ts"),
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
