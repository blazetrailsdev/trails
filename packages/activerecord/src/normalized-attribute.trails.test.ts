import { describe, it, expect } from "vitest";
import { Company } from "./test-helpers/models/company.js";
import { fixtures } from "./test-fixtures.js";
import { StringType, ValueType } from "@blazetrails/activemodel";
import { NormalizedValueType } from "./normalization.js";

class NormalizedCompany extends Company {}
class OtherCompany extends Company {}
class ReloadedCompany extends Company {}
class RefreshedCompany extends Company {}

const defTypeFor = (klass: typeof Company, name: string) => klass.typeForAttribute(name)!;

describe("STI subclass normalizes", () => {
  fixtures([]);

  it("does not leak the decorated cast type onto the STI base or siblings", async () => {
    await NormalizedCompany.loadSchema();
    await Company.loadSchema();

    NormalizedCompany.normalizes("name", {
      with: (name: unknown) => (typeof name === "string" ? name.trim().toUpperCase() : name),
    });

    expect(NormalizedCompany.typeForAttribute("name")!.cast("  acme  ")).toBe("ACME");
    expect(Company.typeForAttribute("name")!.cast("  acme  ")).toBe("  acme  ");
    expect(OtherCompany.typeForAttribute("name")!.cast("  acme  ")).toBe("  acme  ");

    expect(NormalizedCompany.new({ name: "  acme  " }).name).toBe("ACME");
    expect(Company.new({ name: "  acme  " }).name).toBe("  acme  ");
  });

  it("keeps the subclass decoration across a schema reset and re-reflection", async () => {
    await ReloadedCompany.loadSchema();
    await Company.loadSchema();

    ReloadedCompany.normalizes("name", {
      with: (name: unknown) => (typeof name === "string" ? name.trim().toUpperCase() : name),
    });
    expect(ReloadedCompany.typeForAttribute("name")!.cast("  acme  ")).toBe("ACME");

    void ReloadedCompany.resetColumnInformation();
    await Company.loadSchema();
    await ReloadedCompany.loadSchema();

    expect(ReloadedCompany.typeForAttribute("name")!.cast("  acme  ")).toBe("ACME");
    expect(Company.typeForAttribute("name")!.cast("  acme  ")).toBe("  acme  ");
  });

  it("re-reflects a subclass whose key set is unchanged after a base reset", async () => {
    await RefreshedCompany.loadSchema();
    await Company.loadSchema();

    RefreshedCompany.normalizes("description", { with: (value: unknown) => value });
    const defsOf = (klass: typeof Company) => klass.columnsHash();
    expect(Object.keys(defsOf(Company)).every((k) => k in defsOf(RefreshedCompany))).toBe(true);

    void Company.resetColumnInformation();
    await Company.loadSchema();
    await RefreshedCompany.loadSchema();

    expect(defsOf(RefreshedCompany)).not.toBe(defsOf(Company));
    expect(Object.keys(defsOf(Company)).every((k) => k in defsOf(RefreshedCompany))).toBe(true);
    expect(defTypeFor(RefreshedCompany, "description").cast("x")).toBe("x");
  });
});

describe("NormalizedValueType equality", () => {
  const build = (
    castType: ValueType,
    normalizer: (value: unknown) => unknown,
    normalizeNil = false,
  ) => new NormalizedValueType({ castType, normalizer, normalizeNil });

  it("does not answer equality from the wrapped cast type", () => {
    const castType = new StringType();
    const normalizer = (value: unknown) => value;

    expect(build(castType, normalizer).equals(castType)).toBe(false);
    expect(
      build(castType, normalizer).equals(build(castType, normalizer) as unknown as ValueType),
    ).toBe(true);
  });

  it("distinguishes normalizer and apply_to_nil", () => {
    const castType = new StringType();
    const normalizer = (value: unknown) => value;

    expect(
      build(castType, normalizer).equals(build(castType, (value) => value) as unknown as ValueType),
    ).toBe(false);
    expect(
      build(castType, normalizer).equals(build(castType, normalizer, true) as unknown as ValueType),
    ).toBe(false);
  });
});
