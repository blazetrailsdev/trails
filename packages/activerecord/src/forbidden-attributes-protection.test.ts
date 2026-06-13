/**
 * Mirrors: activerecord/test/cases/forbidden_attributes_protection_test.rb
 *
 * Strong-parameters protection: mass assignment, create_with, where, and
 * where.not all reject an un-permitted params object and unwrap a permitted
 * one. Uses the ProtectedParams stub (test-helpers/protected-params.ts),
 * mirroring Rails' test/support/stubs/strong_parameters.rb.
 *
 * Uses the canonical `Person` / `Company` models + `people`/`companies`
 * fixtures (Rails reads `Person`/`Company` directly here) so this handler-suite
 * file no longer writes a bespoke reduced `people` shape into the shared worker
 * DB — eliminating the cross-file collision that `locking.test.ts` guards
 * against with `dropExisting`.
 */
import { describe, it, expect } from "vitest";
import { ForbiddenAttributesError } from "@blazetrails/activemodel";
// Side-effect: registers the Relation constructor on Base (the canonical models
// import only base.js, which doesn't load relation.ts on its own).
import "./index.js";
import { Person } from "./test-helpers/models/person.js";
import { Company } from "./test-helpers/models/company.js";
import { ShipPart } from "./test-helpers/models/ship-part.js";
import { Ship } from "./test-helpers/models/ship.js";
import { Treasure } from "./test-helpers/models/treasure.js";
import { registerModel } from "./associations.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { ProtectedParams } from "./test-helpers/protected-params.js";

// ShipPart's nested associations resolve `Ship` / `Treasure` from the model
// registry at build time; ship.ts and treasure.ts don't self-register.
registerModel(ShipPart);
registerModel(Ship);
registerModel(Treasure);

describe("ForbiddenAttributesProtectionTest", () => {
  useHandlerFixtures(["people", "companies"], { schema: canonicalSchema });

  it("forbidden attributes cannot be used for mass assignment", () => {
    const params = new ProtectedParams({ first_name: "Guille", gender: "m" });
    expect(() => new Person(params)).toThrow(ForbiddenAttributesError);
  });

  it("permitted attributes can be used for mass assignment", () => {
    const params = new ProtectedParams({ first_name: "Guille", gender: "m" });
    params.permit();
    const person = new Person(params);

    expect(person.readAttribute("first_name")).toBe("Guille");
    expect(person.readAttribute("gender")).toBe("m");
  });

  it("forbidden attributes cannot be used for sti inheritance column", () => {
    const params = new ProtectedParams({ type: "Client" });
    expect(() => new Company(params)).toThrow(ForbiddenAttributesError);
  });

  it.skip("permitted attributes can be used for sti inheritance column", () => {
    // BLOCKED: inheritance — STI dispatch at `new` not wired.
    // ROOT-CAUSE: subclassFromAttributes (inheritance.ts:596) exists but isn't
    // invoked from the Base constructor, so `new Company({ type: "Client" })`
    // builds a Company, not a Client. Wiring it into construction is unsafe
    // today: the global STI registry resolves bare class names ambiguously
    // across test files (two `Firm`/`Client` classes), causing SubclassNotFound
    // and mis-dispatch. SCOPE: registry-safe STI-at-new wiring, separate PR.
  });

  it("regular hash should still be used for mass assignment", () => {
    const person = new Person({ first_name: "Guille", gender: "m" });

    expect(person.readAttribute("first_name")).toBe("Guille");
    expect(person.readAttribute("gender")).toBe("m");
  });

  it("blank attributes should not raise", () => {
    const person = new Person();
    expect(person.assignAttributes(new ProtectedParams({}))).toBeUndefined();
  });

  it("create with checks permitted", () => {
    const params = new ProtectedParams({ first_name: "Guille", gender: "m" });

    expect(() => Person.createWith(params)).toThrow(ForbiddenAttributesError);
  });

  it("create with works with permitted params", async () => {
    const params = new ProtectedParams({ first_name: "Guille" }).permit();

    const person = await Person.createWith(params).createBang();
    expect(person.readAttribute("first_name")).toBe("Guille");
  });

  it("create with works with params values", async () => {
    const params = new ProtectedParams({ first_name: "Guille" });

    const person = await Person.createWith({ first_name: params["first_name"] }).createBang();
    expect(person.readAttribute("first_name")).toBe("Guille");
  });

  it("where checks permitted", () => {
    const params = new ProtectedParams({ first_name: "Guille", gender: "m" });

    expect(() => Person.where(params)).toThrow(ForbiddenAttributesError);
  });

  it("where works with permitted params", async () => {
    const params = new ProtectedParams({ first_name: "Guille" }).permit();

    const person = await Person.where(params).createBang();
    expect(person.readAttribute("first_name")).toBe("Guille");
  });

  it("where works with params values", async () => {
    const params = new ProtectedParams({ first_name: "Guille" });

    const person = await Person.where({ first_name: params["first_name"] }).createBang();
    expect(person.readAttribute("first_name")).toBe("Guille");
  });

  it("where not checks permitted", () => {
    const params = new ProtectedParams({ first_name: "Guille", gender: "m" });

    expect(() => Person.whereNot(params)).toThrow(ForbiddenAttributesError);
  });

  it("where not works with permitted params", async () => {
    const params = new ProtectedParams({ first_name: "Guille" }).permit();
    await Person.createBang(params);

    const remaining = (await Person.whereNot(params).toArray()).filter(
      (p) => p.readAttribute("first_name") === "Guille",
    );
    expect(remaining).toHaveLength(0);
  });

  it("strong params style objects work with singular associations", () => {
    const params = new ProtectedParams({
      name: "Stern",
      shipAttributes: new ProtectedParams({ name: "The Black Rock" }).permit(),
    }).permit();
    const part = new ShipPart(params);

    expect(part.readAttribute("name")).toBe("Stern");
    expect((part as any).ship.readAttribute("name")).toBe("The Black Rock");
  });

  it("strong params style objects work with collection associations", () => {
    const params = new ProtectedParams({
      trinketsAttributes: new ProtectedParams({
        "0": new ProtectedParams({ name: "Necklace" }).permit(),
        "1": new ProtectedParams({ name: "Spoon" }).permit(),
      }).permit(),
    }).permit();
    const part = new ShipPart(params);

    expect((part as any).trinkets[0].readAttribute("name")).toBe("Necklace");
    expect((part as any).trinkets[1].readAttribute("name")).toBe("Spoon");
  });
});
