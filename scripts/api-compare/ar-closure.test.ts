import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { deriveArClosure, DATA_LAYER_PACKAGES } from "./ar-closure.js";

const REAL_VENDOR = path.resolve(__dirname, "../../vendor/rails/activerecord/lib/active_record.rb");

function write(root: string, rel: string, body: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

describe("deriveArClosure", () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ar-closure-"));
    write(
      root,
      "vendor/rails/activerecord/lib/active_record/base.rb",
      'require "active_support/core_ext/module/attribute_accessors"\nrequire "active_support/core_ext/array"\n',
    );
    write(
      root,
      "vendor/rails/activemodel/lib/active_model/naming.rb",
      'require "i18n"\nrequire "action_dispatch/http/response"\n',
    );
    write(
      root,
      "vendor/rails/activesupport/lib/active_support/core_ext/module/attribute_accessors.rb",
      "",
    );
    // An umbrella: a file whose whole body is a require list.
    write(
      root,
      "vendor/rails/activesupport/lib/active_support/core_ext/array.rb",
      'require "active_support/core_ext/array/wrap"\n',
    );
    write(root, "vendor/rails/activesupport/lib/active_support/core_ext/array/wrap.rb", "");
    // Vendored but never required by AR/AM.
    write(root, "vendor/rails/activesupport/lib/active_support/core_ext/uri.rb", "");
    write(root, "vendor/i18n/lib/i18n.rb", 'require "i18n/backend"\n');
    write(root, "vendor/i18n/lib/i18n/backend.rb", "");
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("includes activesupport files ActiveRecord requires directly", () => {
    expect(deriveArClosure(root).files.activesupport).toContain(
      "core_ext/module/attribute_accessors.rb",
    );
  });

  it("expands umbrella require-lists transitively", () => {
    expect(deriveArClosure(root).files.activesupport).toContain("core_ext/array/wrap.rb");
  });

  it("omits vendored files nothing in the data layer requires", () => {
    expect(deriveArClosure(root).files.activesupport).not.toContain("core_ext/uri.rb");
  });

  it("follows requires into the other support gems", () => {
    // i18n.rb is the gem entrypoint, above the package root, so only what it
    // pulls in lands in the closure.
    expect(deriveArClosure(root).files.i18n).toEqual(["backend.rb"]);
  });

  it("stops at a require reaching a package outside the closure", () => {
    expect(deriveArClosure(root).files.actiondispatch).toBeUndefined();
  });

  it("does not report the data-layer packages, which are rolled up whole", () => {
    for (const pkg of DATA_LAYER_PACKAGES) {
      expect(deriveArClosure(root).files[pkg]).toBeUndefined();
    }
  });

  it("reports paths relative to the package root, not the gem lib dir", () => {
    for (const file of deriveArClosure(root).files.activesupport ?? []) {
      expect(file.startsWith("active_support/")).toBe(false);
      expect(file.endsWith(".rb")).toBe(true);
    }
  });

  // The vendored gems are fetched for the compare jobs, not for Unit Tests.
  describe.skipIf(!fs.existsSync(REAL_VENDOR))("against the vendored Rails source", () => {
    it("derives the real activesupport closure", () => {
      const files = deriveArClosure().files.activesupport ?? [];
      expect(files).toContain("core_ext/module/delegation.rb");
      expect(files).toContain("core_ext/array/wrap.rb");
      expect(files).not.toContain("core_ext/uri.rb");
    });
  });
});
