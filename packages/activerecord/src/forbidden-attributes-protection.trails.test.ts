import { describe, it, expect } from "vitest";
import { ForbiddenAttributesError, SecurePassword } from "@blazetrails/activemodel";
import "./index.js";
import { Person } from "./test-helpers/models/person.js";
import { Bird } from "./test-helpers/models/bird.js";
import { Pirate } from "./test-helpers/models/pirate.js";
import { Ship } from "./test-helpers/models/ship.js";
import { User } from "./test-helpers/models/user.js";
import { fixtures } from "./test-fixtures.js";
import { ProtectedParams } from "./support/stubs/strong-parameters.js";

describe("ForbiddenAttributesProtectionUpdateTest", () => {
  fixtures(["people"]);

  it("forbidden attributes cannot be used for update", async () => {
    const person = await Person.first();
    await expect(person!.update(new ProtectedParams({ first_name: "Guille" }))).rejects.toThrow(
      ForbiddenAttributesError,
    );
  });

  it("forbidden attributes cannot be used for update!", async () => {
    const person = await Person.first();
    await expect(person!.updateBang(new ProtectedParams({ first_name: "Guille" }))).rejects.toThrow(
      ForbiddenAttributesError,
    );
  });

  it("permitted attributes can be used for update", async () => {
    const person = await Person.first();
    await person!.update(new ProtectedParams({ first_name: "Guille" }).permitBang());

    expect(person!.readAttribute("first_name")).toBe("Guille");
    await person!.reload();
    expect(person!.readAttribute("first_name")).toBe("Guille");
  });

  it("forbidden attributes raise before the locking-column guard", async () => {
    const person = await Person.first();
    await expect(
      person!.update(new ProtectedParams({ lock_version: 1, first_name: "Guille" })),
    ).rejects.toThrow(ForbiddenAttributesError);
  });

  it("empty forbidden params still save without raising", async () => {
    const person = await Person.first();
    await expect(person!.update(new ProtectedParams({}))).resolves.toBe(true);
  });
});

describe("ForbiddenAttributesProtectionNewTest", () => {
  fixtures(["people"]);

  it("permitted attributes can be used for new and build", () => {
    for (const person of [
      new Person(new ProtectedParams({ first_name: "Guille" }).permitBang()),
      Person.build(new ProtectedParams({ first_name: "Guille" }).permitBang()),
    ]) {
      expect(person.readAttribute("first_name")).toBe("Guille");
    }
  });

  it("forbidden attributes cannot be used for new and build", () => {
    expect(() => new Person(new ProtectedParams({ first_name: "Guille" }))).toThrow(
      ForbiddenAttributesError,
    );
    expect(() => Person.build(new ProtectedParams({ first_name: "Guille" }))).toThrow(
      ForbiddenAttributesError,
    );
  });

  it("new inside a scope assigns permitted params over the scope's attributes", () => {
    const person = Person.where({ gender: "f" }).scoping(
      () => new Person(new ProtectedParams({ first_name: "Guille" }).permitBang()),
    );
    expect(person.readAttribute("first_name")).toBe("Guille");
    expect(person.readAttribute("gender")).toBe("f");
  });

  it("new inside a scope still checks permitted", () => {
    expect(() =>
      Person.where({ gender: "f" }).scoping(
        () => new Person(new ProtectedParams({ first_name: "Guille" })),
      ),
    ).toThrow(ForbiddenAttributesError);
  });
});

describe("ForbiddenAttributesProtectionHashReadersTest", () => {
  fixtures({ pirates: [Pirate, {}], ships: [Ship, {}], birds: [Bird, {}], users: [User, {}] });

  it("permitted params assign nested attributes for a one-to-one association", async () => {
    const pirate = await Pirate.create(
      new ProtectedParams({
        catchphrase: "Arr",
        shipAttributes: { name: "Nights Dirty Lightning" },
      }).permitBang(),
    );

    expect((await pirate.ship)!.name).toBe("Nights Dirty Lightning");

    const ship = (await pirate.ship)!;
    await pirate.update(
      new ProtectedParams({ shipAttributes: { id: ship.id, name: "Mayflower" } }).permitBang(),
    );
    expect((await ship.reload()).name).toBe("Mayflower");
  });

  it("permitted params assign nested attributes for a collection association", async () => {
    const pirate = await Pirate.create(
      new ProtectedParams({
        catchphrase: "Arr",
        birdsAttributes: { 0: { name: "Posideons Killer" }, 1: { name: "Killer bandita Dionne" } },
      }).permitBang(),
    );

    const birds = await pirate.birds;
    expect(birds.map((bird) => bird.name).sort()).toEqual([
      "Killer bandita Dionne",
      "Posideons Killer",
    ]);

    await pirate.update(
      new ProtectedParams({
        birdsAttributes: [{ id: birds[0].id, name: "Grace OMalley" }],
      }).permitBang(),
    );
    expect((await birds[0].reload()).name).toBe("Grace OMalley");
  });

  it("permitted params are read as the finder and password arguments of authenticate_by", async () => {
    const originalMinCost = SecurePassword.minCost;
    SecurePassword.minCost = true;
    try {
      const user = await User.create({ password: "abc123", recovery_password: "123abc" });
      const params = new ProtectedParams({ token: user.token, password: "abc123" }).permitBang();

      expect((await User.authenticateBy(params))?.id).toBe(user.id);
    } finally {
      SecurePassword.minCost = originalMinCost;
    }
  });
});
