import { describe, it, expect } from "vitest";
import { deriveArClosure, DATA_LAYER_PACKAGES } from "./ar-closure.js";

describe("deriveArClosure", () => {
  const closure = deriveArClosure();

  it("includes activesupport files ActiveRecord requires directly", () => {
    // active_record/base.rb requires "active_support/core_ext/module/attribute_accessors".
    expect(closure.files.activesupport).toContain("core_ext/module/attribute_accessors.rb");
  });

  it("expands umbrella require-lists transitively", () => {
    // active_support/rails.rb → core_ext/module/delegation; core_ext/array.rb →
    // core_ext/array/*.rb. Neither is named anywhere in this repo.
    expect(closure.files.activesupport).toContain("core_ext/module/delegation.rb");
    expect(closure.files.activesupport).toContain("core_ext/array/wrap.rb");
  });

  it("omits activesupport files outside the closure", () => {
    // Required by actionpack/actionview, never by ActiveRecord or ActiveModel.
    expect(closure.files.activesupport).not.toContain("core_ext/uri.rb");
  });

  it("does not report the data-layer packages, which are rolled up whole", () => {
    for (const pkg of DATA_LAYER_PACKAGES) {
      expect(closure.files[pkg]).toBeUndefined();
    }
  });

  it("reports paths relative to the package root, not the gem lib dir", () => {
    for (const file of closure.files.activesupport ?? []) {
      expect(file.startsWith("active_support/")).toBe(false);
      expect(file.endsWith(".rb")).toBe(true);
    }
  });
});
