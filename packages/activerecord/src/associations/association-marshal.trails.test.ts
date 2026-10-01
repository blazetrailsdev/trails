import { describe, expect, it } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Firm } from "../test-helpers/models/company.js";
import { Association } from "./association.js";

describe("Association#marshal_dump / #marshal_load", () => {
  const { companies } = fixtures(["companies", "accounts"]);

  it("round-trips every instance variable but the reflection, which is re-resolved from the owner", async () => {
    const firm = companies("first_firm") as Firm;
    const association = firm.association("account");
    await association.loadTarget();

    const [reflectionName, ivars] = association.marshalDump();
    expect(reflectionName).toBe("account");
    const names = ivars.map(([name]) => name);
    expect(names).toContain("@owner");
    expect(names).not.toContain("@reflection");

    const loaded = Object.create(Object.getPrototypeOf(association)) as Association;
    loaded.marshalLoad([reflectionName, ivars]);

    expect(loaded.owner).toBe(firm);
    expect(loaded.isLoaded()).toBe(true);
    expect(loaded.target).toBe(association.target);
    expect(loaded.reflection).toBe(Firm._reflectOnAssociation("account"));
  });
});
