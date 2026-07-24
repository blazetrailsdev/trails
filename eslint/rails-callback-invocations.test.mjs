import { RuleTester } from "eslint";
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Hermetic fixtures: point the rule at tmp manifest + exclude files via the
// env overrides it reads lazily, so the test never touches the committed one.
const MANIFEST_FIXTURE = path.join(__dirname, ".tmp-rails-callback-invocations.test.json");
const EXCLUDE_FIXTURE = path.join(__dirname, ".tmp-rails-callback-invocations-exclude.test.json");

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

const excludedRel = "packages/activerecord/src/grandfathered.ts";
manifest.methods[`${excludedRel}#destroy`] = ["destroy"];

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

// Ratchet hygiene: the committed exclude baseline must only grandfather
// methods the committed manifest actually constrains. A dead/typo'd entry
// (wrong path or a method name not in the manifest) would silently linger and
// defeat the "list only shrinks" contract — the entry could never be reached,
// so removing it could never be forced. This reads the real committed files
// (not the tmp fixtures) to keep them honest.
describe("rails-callback-invocations baseline", () => {
  const manifestKeys = new Set(
    Object.keys(
      JSON.parse(fs.readFileSync(path.join(__dirname, "rails-callback-invocations.json"), "utf8"))
        .methods,
    ),
  );
  const baseline = JSON.parse(
    fs.readFileSync(path.join(__dirname, "rails-callback-invocations-exclude.json"), "utf8"),
  );

  it("every entry is a file-qualified `<packages/activerecord/src path>#<manifest method>` key", () => {
    for (const entry of baseline) {
      const [rel] = entry.split("#");
      expect(entry, `entry "${entry}" must be path#method`).toContain("#");
      expect(rel, `entry "${entry}" path out of scope`).toMatch(
        /^packages\/activerecord\/src\/.+\.ts$/,
      );
      // The manifest is now file-qualified, so the whole entry must be a live
      // manifest key — a stale `<rel>#<method>` the manifest no longer emits
      // could never be reached, defeating the shrink-only ratchet.
      expect(manifestKeys, `entry "${entry}" is not a live manifest key`).toContain(entry);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(baseline).size).toBe(baseline.length);
  });
});
