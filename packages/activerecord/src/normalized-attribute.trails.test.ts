/**
 * trails-only: `normalizes` declared on an STI subclass must decorate only that
 * subclass's attribute types. Rails keeps this per-class (`normalized_attributes`
 * is a `class_attribute` and `_default_attributes` replays only the class's own
 * pending decorators), but trails' STI reflection installed the base's shared
 * `_attributeDefinitions` map as an OWN property of the subclass, which fooled
 * the copy-on-write guard in `decorateAttributes` — so the subclass decoration
 * landed on the base's definitions and leaked to sibling subclasses.
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

class NormalizedCompany extends Company {}
class OtherCompany extends Company {}
class ReloadedCompany extends Company {}
class RefreshedCompany extends Company {}

const defTypeFor = (klass: typeof Company, name: string) =>
  (
    klass as unknown as {
      _attributeDefinitions: Map<string, { type: { cast(v: unknown): unknown } }>;
    }
  )._attributeDefinitions.get(name)!.type;

describe("STI subclass normalizes", () => {
  fixtures([]);

  it("does not leak the decorated cast type onto the STI base or siblings", async () => {
    await NormalizedCompany.loadSchema();
    await Company.loadSchema();

    NormalizedCompany.normalizes("name", (name: unknown) =>
      typeof name === "string" ? name.trim().toUpperCase() : name,
    );

    expect(defTypeFor(NormalizedCompany, "name").cast("  acme  ")).toBe("ACME");
    expect(defTypeFor(Company, "name").cast("  acme  ")).toBe("  acme  ");
    expect(defTypeFor(OtherCompany, "name").cast("  acme  ")).toBe("  acme  ");

    expect(NormalizedCompany.new({ name: "  acme  " }).name).toBe("ACME");
    expect(Company.new({ name: "  acme  " }).name).toBe("  acme  ");
  });

  it("keeps the subclass decoration across a schema reset and re-reflection", async () => {
    await ReloadedCompany.loadSchema();
    await Company.loadSchema();

    ReloadedCompany.normalizes("name", (name: unknown) =>
      typeof name === "string" ? name.trim().toUpperCase() : name,
    );
    expect(defTypeFor(ReloadedCompany, "name").cast("  acme  ")).toBe("ACME");

    // Rails re-seeds `_default_attributes` from `columns_hash` and replays the
    // pending-decorator chain on every rebuild, so reflection must not revert
    // (or drop) the subclass's decorated definition.
    ReloadedCompany.resetColumnInformation();
    await Company.loadSchema();
    await ReloadedCompany.loadSchema();

    expect(defTypeFor(ReloadedCompany, "name").cast("  acme  ")).toBe("ACME");
    expect(defTypeFor(Company, "name").cast("  acme  ")).toBe("  acme  ");
  });

  it("re-reflects a subclass whose key set is unchanged after a base reset", async () => {
    await RefreshedCompany.loadSchema();
    await Company.loadSchema();

    RefreshedCompany.normalizes("description", (value: unknown) => value);
    const defsOf = (klass: typeof Company) =>
      (klass as unknown as { _attributeDefinitions: Map<string, object> })._attributeDefinitions;
    expect([...defsOf(Company).keys()].every((k) => defsOf(RefreshedCompany).has(k))).toBe(true);

    // Rails' reset_column_information invalidates the class AND its descendants,
    // so a subclass must not keep an old overlay merely because it still covers
    // every key — reflection can change a column's type/default in place.
    Company.resetColumnInformation();
    await Company.loadSchema();
    await RefreshedCompany.loadSchema();

    expect(defsOf(RefreshedCompany)).not.toBe(defsOf(Company));
    expect(defsOf(RefreshedCompany).get("name")).not.toBe(defsOf(Company).get("name"));
    expect([...defsOf(Company).keys()].every((k) => defsOf(RefreshedCompany).has(k))).toBe(true);
    expect(defTypeFor(RefreshedCompany, "description").cast("x")).toBe("x");
  });
});
