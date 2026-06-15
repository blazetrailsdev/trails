/**
 * Mirrors Rails
 * activerecord/test/cases/associations/eager_load_includes_full_sti_class_test.rb
 *
 * All four classes (FullStiClassNamesTest / NonFullStiClassNamesTest /
 * PolymorphicFullClassNamesTest / PolymorphicNonFullClassNamesTest) toggle
 * `ActiveRecord::Base.store_full_sti_class` / `store_full_class_name` and assert
 * that a polymorphic `taggable` association resolves (or does not resolve)
 * depending on whether the stored type column holds the namespaced or
 * demodulized class name. trails does not implement `storeFullStiClass` /
 * `storeFullClassName`, so these cannot be ported faithfully yet — see the
 * upstream-fix story below.
 */
import { describe, it } from "vitest";

// BLOCKED: missing config — Base.storeFullStiClass / Base.storeFullClassName.
// ROOT-CAUSE: trails has no store_full_sti_class / store_full_class_name
//   support; the tests toggle these flags and assert that the polymorphic
//   taggable_type column resolution changes accordingly. Tracked upstream as
//   story `store-full-sti-class-name` (RFC 0030).
describe("FullStiClassNamesTest", () => {
  it.skip("class names", () => {});
  it.skip("class names with includes", () => {});
  it.skip("class names with eager load", () => {});
  it.skip("class names with find by", () => {});
});

describe("NonFullStiClassNamesTest", () => {
  it.skip("class names", () => {});
  it.skip("class names with includes", () => {});
  it.skip("class names with eager load", () => {});
  it.skip("class names with find by", () => {});
});

describe("PolymorphicFullClassNamesTest", () => {
  it.skip("class names", () => {});
  it.skip("class names with includes", () => {});
  it.skip("class names with eager load", () => {});
  it.skip("class names with find by", () => {});
});

describe("PolymorphicNonFullClassNamesTest", () => {
  it.skip("class names", () => {});
  it.skip("class names with includes", () => {});
  it.skip("class names with eager load", () => {});
  it.skip("class names with find by", () => {});
});
