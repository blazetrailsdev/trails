import { describe, it } from "vitest";

describe("InheritedTest", () => {
  it.skip("super before filter attributes", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/conventions.ts) — ruby-module-semantics
    // Rails tests that Device.inherited calls `super` before setting filter_attributes on
    // the subclass. The `inherited` lifecycle hook has no TypeScript equivalent.
  });

  it.skip("super after filter attributes", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/conventions.ts) — ruby-module-semantics
    // Rails tests that Vehicle.inherited calls `super` after setting filter_attributes on
    // the subclass. The `inherited` lifecycle hook has no TypeScript equivalent.
  });
});
