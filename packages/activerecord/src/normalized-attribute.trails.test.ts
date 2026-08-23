/**
 * trails-only: `normalizes` declared on an STI subclass must decorate only that
 * subclass's attribute types. Rails keeps this per-class (`normalized_attributes`
 * is a `class_attribute` and `_default_attributes` replays only the class's own
 * pending decorators), but trails' STI reflection installed the base's shared
 * `_attributeDefinitions` map as an OWN property of the subclass, so a
 * subclass decoration could land on the base and leak to sibling subclasses.
 * The decorated type is read where Rails reads it — `type_for_attribute` over
 * the replayed attribute set (attribute_registration.rb:43-51).
 *
 * The leak only reproduces when the SUBCLASS drives the first reflection of the
 * STI table (that is the path that installs the base map as an own property), so
 * this file must own that first reflection — do not add a test above that
 * reflects `Company` (or another subclass) first, or the guard silently stops
 * guarding.
 */
import { describe, it, expect } from "vitest";
import { Company } from "./test-helpers/models/company.js";
import { fixtures } from "./test-fixtures.js";
import { StringType, Type } from "@blazetrails/activemodel";
import { NormalizedValueType } from "./normalization.js";

class NormalizedCompany extends Company {}
class OtherCompany extends Company {}
class ReloadedCompany extends Company {}
class RefreshedCompany extends Company {}

const defTypeFor = (klass: typeof Company, name: string) => klass.typeForAttribute(name);

describe("STI subclass normalizes", () => {
  fixtures([]);

  it("does not leak the decorated cast type onto the STI base or siblings", async () => {
    await NormalizedCompany.loadSchema();
    await Company.loadSchema();

    NormalizedCompany.normalizes("name", {
      with: (name: unknown) => (typeof name === "string" ? name.trim().toUpperCase() : name),
    });

    expect(NormalizedCompany.typeForAttribute("name").cast("  acme  ")).toBe("ACME");
    expect(Company.typeForAttribute("name").cast("  acme  ")).toBe("  acme  ");
    expect(OtherCompany.typeForAttribute("name").cast("  acme  ")).toBe("  acme  ");

    expect(NormalizedCompany.new({ name: "  acme  " }).name).toBe("ACME");
    expect(Company.new({ name: "  acme  " }).name).toBe("  acme  ");
  });

  it("keeps the subclass decoration across a schema reset and re-reflection", async () => {
    await ReloadedCompany.loadSchema();
    await Company.loadSchema();

    ReloadedCompany.normalizes("name", {
      with: (name: unknown) => (typeof name === "string" ? name.trim().toUpperCase() : name),
    });
    expect(ReloadedCompany.typeForAttribute("name").cast("  acme  ")).toBe("ACME");

    // Rails re-seeds `_default_attributes` from `columns_hash` and replays the
    // pending-decorator chain on every rebuild, so reflection must not revert
    // (or drop) the subclass's decorated definition.
    void ReloadedCompany.resetColumnInformation();
    await Company.loadSchema();
    await ReloadedCompany.loadSchema();

    expect(ReloadedCompany.typeForAttribute("name").cast("  acme  ")).toBe("ACME");
    expect(Company.typeForAttribute("name").cast("  acme  ")).toBe("  acme  ");
  });

  it("re-reflects a subclass whose key set is unchanged after a base reset", async () => {
    await RefreshedCompany.loadSchema();
    await Company.loadSchema();

    RefreshedCompany.normalizes("description", { with: (value: unknown) => value });
    const defsOf = (klass: typeof Company) => klass.columnsHash();
    expect(Object.keys(defsOf(Company)).every((k) => k in defsOf(RefreshedCompany))).toBe(true);

    // Rails' reset_column_information invalidates the class AND its descendants,
    // so a subclass must not keep an old overlay merely because it still covers
    // every key — reflection can change a column's type/default in place.
    void Company.resetColumnInformation();
    await Company.loadSchema();
    await RefreshedCompany.loadSchema();

    expect(defsOf(RefreshedCompany)).not.toBe(defsOf(Company));
    expect(Object.keys(defsOf(Company)).every((k) => k in defsOf(RefreshedCompany))).toBe(true);
    expect(defTypeFor(RefreshedCompany, "description").cast("x")).toBe("x");
  });
});

/**
 * trails-only: `NormalizedValueType` is a `methodMissingProxy` standing in for
 * Ruby's `DelegateClass`, so every method it does not define binds to the
 * wrapped type. `==` (normalization.rb:143-148, spelled `equals` here per
 * `type/value.ts:221`) is one Rails defines precisely so the decorator answers
 * for itself — without the override the forwarding reports a decorated type as
 * equal to the undecorated one it wraps.
 */
describe("NormalizedValueType equality", () => {
  const build = (castType: Type, normalizer: (value: unknown) => unknown, normalizeNil = false) =>
    new NormalizedValueType({ castType, normalizer, normalizeNil });

  it("does not answer equality from the wrapped cast type", () => {
    const castType = new StringType();
    const normalizer = (value: unknown) => value;

    expect(build(castType, normalizer).equals(castType)).toBe(false);
    expect(build(castType, normalizer).equals(build(castType, normalizer) as unknown as Type)).toBe(
      true,
    );
  });

  it("distinguishes normalizer and apply_to_nil", () => {
    const castType = new StringType();
    const normalizer = (value: unknown) => value;

    expect(
      build(castType, normalizer).equals(build(castType, (value) => value) as unknown as Type),
    ).toBe(false);
    expect(
      build(castType, normalizer).equals(build(castType, normalizer, true) as unknown as Type),
    ).toBe(false);
  });
});
