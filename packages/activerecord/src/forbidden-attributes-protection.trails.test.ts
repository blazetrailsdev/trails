import { describe, it, expect } from "vitest";
import { ForbiddenAttributesError } from "@blazetrails/activemodel";
import "./index.js";
import { Person } from "./test-helpers/models/person.js";
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
