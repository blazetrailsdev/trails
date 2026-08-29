import { describe, it, expect } from "vitest";
import { ActiveRecord, Base, registerModel } from "../index.js";
import { NestedError } from "./nested-error.js";
import { fixtures } from "../test-fixtures.js";
import type { AssociationProxy } from "./collection-proxy.js";
import { Guitar } from "../test-helpers/models/guitar.js";
import { TuningPeg } from "../test-helpers/models/tuning-peg.js";
import { Owner } from "../test-helpers/models/owner.js";
import { Pet } from "../test-helpers/models/pet.js";

describe("AssociationsNestedErrorInAssociationOrderTest", () => {
  fixtures({ guitars: [Guitar, {}], tuning_pegs: [TuningPeg, {}] });

  it("index in association order", async () => {
    const guitar = await Guitar.createBang({});
    await guitar.tuningPegs.createBang({ pitch: 1 });
    const peg2 = await guitar.tuningPegs.createBang({ pitch: 2 });
    (peg2 as { pitch: number | null }).pitch = null;
    await guitar.isValid();

    const error = guitar.errors.objects[0] as NestedError;

    expect(error).toBeInstanceOf(NestedError);
    expect(error.innerError).toBe(peg2.errors.objects[0]);
    expect(error.attribute).toBe("tuningPegs[1].pitch");
    expect(error.type).toBe(":not_a_number");
    expect(error.message).toBe("is not a number");
    expect(error.base).toBe(guitar);
  });
});

describe("AssociationsNestedErrorInNestedAttributesOrderTest", () => {
  fixtures({ guitars: [Guitar, {}], tuning_pegs: [TuningPeg, {}] });

  class NestedOrderGuitar extends Base {
    static tableName = "guitars";
    declare tuningPegs: AssociationProxy<TuningPeg>;
    static {
      this.hasMany("tuningPegs", {
        className: "TuningPeg",
        foreignKey: "guitar_id",
        indexErrors: "nestedAttributesOrder",
      });
      this.acceptsNestedAttributesFor("tuningPegs", {
        rejectIf: (attrs: Record<string, unknown>) =>
          attrs["pitch"] != null && Number(attrs["pitch"]) % 2 === 1,
      });
    }
  }

  it("index in nested attributes order", async () => {
    const guitar = await NestedOrderGuitar.createBang({});
    await guitar.tuningPegs.createBang({ pitch: 1 });
    const peg2 = await guitar.tuningPegs.createBang({ pitch: 2 });
    await guitar.update({ tuningPegsAttributes: [{ id: peg2.id, pitch: null }] });

    const error = guitar.errors.objects[0] as NestedError;

    expect(error).toBeInstanceOf(NestedError);
    expect(error.innerError).toBe(peg2.errors.objects[0]);
    expect(error.attribute).toBe("tuningPegs[0].pitch");
    expect(error.type).toBe(":not_a_number");
    expect(error.message).toBe("is not a number");
    expect(error.base).toBe(guitar);
  });

  it("index unaffected by reject_if", async () => {
    const guitar = await NestedOrderGuitar.createBang({});

    await guitar.update({
      tuningPegsAttributes: [{ pitch: 1 }, { pitch: null }],
    });

    const error = guitar.errors.objects[0] as NestedError;

    expect(error).toBeInstanceOf(NestedError);
    expect(error.attribute).toBe("tuningPegs[1].pitch");
    expect(error.type).toBe(":not_a_number");
    expect(error.message).toBe("is not a number");
    expect(error.base).toBe(guitar);
  });

  describe("AssociationsNestedErrorWithSingularAssociationTest", () => {
    fixtures({ owners: [Owner, {}], pets: [Pet, {}] });

    class ValidatedPet extends Base {
      static tableName = "pets";
      declare name: string | null;
      static {
        this._primaryKey = "pet_id";
        this.validates("name", { presence: true });
      }
    }
    class PetOwner extends Base {
      static tableName = "owners";
      declare pet: ValidatedPet | null;
      static {
        this._primaryKey = "owner_id";
        this.hasOne("pet", { className: "NestedErrorValidatedPet", foreignKey: "owner_id" });
        this.acceptsNestedAttributesFor("pet");
        this.validatesAssociated("pet");
      }
    }
    registerModel("NestedErrorValidatedPet", ValidatedPet);
    registerModel("NestedErrorPetOwner", PetOwner);

    it("no index when singular association", async () => {
      const oldAttributeConfig = ActiveRecord.indexNestedAttributeErrors;
      ActiveRecord.indexNestedAttributeErrors = true;
      try {
        const owner = new PetOwner({ petAttributes: { name: null } });
        await owner.isValid();

        const error = owner.errors.objects[0] as NestedError;
        const pet = (owner.association("pet") as unknown as { target?: ValidatedPet }).target!;

        expect(error).toBeInstanceOf(NestedError);
        expect(error.innerError).toStrictEqual(pet.errors.objects[0]);
        expect(error.attribute).toBe("pet.name");
        expect(error.type).toBe(":blank");
        expect(error.message).toBe("can't be blank");
        expect(error.base).toBe(owner);
      } finally {
        ActiveRecord.indexNestedAttributeErrors = oldAttributeConfig;
      }
    });
  });
});
