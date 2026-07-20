/**
 * trails-only: `normalizes` declared on an STI subclass must decorate only that
 * subclass's attribute types. Rails keeps this per-class (`normalized_attributes`
 * is a `class_attribute` and `_default_attributes` replays only the class's own
 * pending decorators), but trails' STI reflection installed the base's shared
 * `_attributeDefinitions` map as an OWN property of the subclass, which fooled
 * the copy-on-write guard in `decorateAttributes` — so the subclass decoration
 * landed on the base's definitions and leaked to sibling subclasses.
 */
import { describe, it, expect } from "vitest";
import { Company } from "./test-helpers/models/company.js";
import { fixtures } from "./test-helpers/fixtures.js";

class NormalizedCompany extends Company {}
class OtherCompany extends Company {}

describe("STI subclass normalizes", () => {
  fixtures([]);

  it("does not leak the decorated cast type onto the STI base or siblings", async () => {
    await NormalizedCompany.loadSchema();
    await Company.loadSchema();

    NormalizedCompany.normalizes("name", (name: unknown) =>
      typeof name === "string" ? name.trim().toUpperCase() : name,
    );

    const defTypeFor = (klass: typeof Company) =>
      (
        klass as unknown as {
          _attributeDefinitions: Map<string, { type: { cast(v: unknown): unknown } }>;
        }
      )._attributeDefinitions.get("name")!.type;

    expect(defTypeFor(NormalizedCompany).cast("  acme  ")).toBe("ACME");
    expect(defTypeFor(Company).cast("  acme  ")).toBe("  acme  ");
    expect(defTypeFor(OtherCompany).cast("  acme  ")).toBe("  acme  ");

    expect(NormalizedCompany.new({ name: "  acme  " }).name).toBe("ACME");
    expect(Company.new({ name: "  acme  " }).name).toBe("  acme  ");
  });
});
