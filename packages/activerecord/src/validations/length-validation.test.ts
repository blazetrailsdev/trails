import { describe, it, expect, beforeAll } from "vitest";
import "../index.js";
import { registerModel, collectionProxyFor as association } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Owner } from "../test-helpers/models/owner.js";
import { Pet } from "../test-helpers/models/pet.js";
import { Range } from "@blazetrails/ruby-compat";

describe("LengthValidationTest", () => {
  fixtures([]);

  beforeAll(async () => {
    registerModel("Owner", Owner);
    registerModel("Pet", Pet);
  });

  function ownerClass(): typeof Owner {
    return class extends Owner {
      static name = "Owner";
    };
  }

  it("validates size of association", async () => {
    const owner = ownerClass();
    expect(() => owner.validatesSizeOf("pets", { minimum: 1 })).not.toThrow();
    const o = new owner({ name: "nopets" });
    expect(await o.save()).toBeFalsy();
    expect(o.errors.messagesFor("pets").length > 0).toBeTruthy();
    association(o, "pets").build({ name: "apet" });
    expect(await o.isValid()).toBeTruthy();
  });

  it("validates size of association using within", async () => {
    const owner = ownerClass();
    expect(() => owner.validatesSizeOf("pets", { within: new Range(1, 2) })).not.toThrow();
    const o = new owner({ name: "nopets" });
    expect(await o.save()).toBeFalsy();
    expect(o.errors.messagesFor("pets").length > 0).toBeTruthy();

    association(o, "pets").build({ name: "apet" });
    expect(await o.isValid()).toBeTruthy();

    for (let i = 0; i < 2; i++) association(o, "pets").build({ name: "apet" });
    expect(await o.save()).toBeFalsy();
    expect(o.errors.messagesFor("pets").length > 0).toBeTruthy();
  });

  it("validates size of association utf8", async () => {
    const owner = ownerClass();
    owner.validatesSizeOf("pets", { minimum: 1 });
    const o = new owner({ name: "あいうえおかきくけこ" });
    expect(await o.save()).toBeFalsy();
    expect(o.errors.messagesFor("pets").length > 0).toBeTruthy();
    association(o, "pets").build({ name: "あいうえおかきくけこ" });
    expect(await o.isValid()).toBeTruthy();
  });

  it("validates size of respects records marked for destruction", async () => {
    const owner = ownerClass();
    owner.validatesSizeOf("pets", { minimum: 1 });
    const o = new owner({ owner_id: 1 });
    expect(await o.save()).toBeFalsy();
    expect(o.errors.messagesFor("pets").length > 0).toBeTruthy();
    const pet = association(o, "pets").build({ pet_id: 1 });
    expect(await o.isValid()).toBeTruthy();
    expect(await o.save()).toBeTruthy();

    const petCount = await Pet.count();
    expect(await o.update({ petsAttributes: [{ _destroy: 1, id: pet.id }] })).toBeFalsy();
    expect(await o.isValid()).toBeFalsy();
    expect(o.errors.messagesFor("pets").length > 0).toBeTruthy();
    expect(await Pet.count()).toBe(petCount);
  });

  it("validates length of virtual attribute on model", async () => {
    const pet = class extends Pet {
      static name = "Pet";
      static {
        this.attribute("nickname", "string");
        this.validatesLengthOf("name", { minimum: 1 });
        this.validatesLengthOf("nickname", { minimum: 1 });
      }
    };
    registerModel("Pet", pet);
    try {
      const p = await pet.create({ pet_id: 1, name: "Fancy Pants", nickname: "Fancy" });
      expect(await p.isValid()).toBeTruthy();
      (p as unknown as { nickname: string }).nickname = "";
      expect(await p.isInvalid()).toBeTruthy();
    } finally {
      registerModel("Pet", Pet);
    }
  });
});
