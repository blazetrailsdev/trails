/**
 * Mirrors: activerecord/test/cases/validations/length_validation_test.rb
 *
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import "../index.js";
import { registerModel, association } from "../associations.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Owner } from "../test-helpers/models/owner.js";
import { Pet } from "../test-helpers/models/pet.js";

describe("LengthValidationTest", () => {
  setupHandlerSuite();
  // Mirrors Rails `fixtures :owners` — transactional fixtures (per-test
  // BEGIN/ROLLBACK). The owner rows themselves are never read by these tests;
  // every case builds fresh records, exactly like the Rails counterpart's
  // `@owner = Class.new(Owner)` + `@owner.new`.
  useHandlerTransactionalFixtures();

  beforeAll(async () => {
    const schema = canonicalSchema as Schema;
    await defineSchema({ owners: schema.owners, pets: schema.pets });
    registerModel("Owner", Owner);
    registerModel("Pet", Pet);
  });

  // `defineSchema` builds a single named PK (`owner_id` / `pet_id`) as a
  // composite-style PK constraint, not an AUTO_INCREMENT column (only the
  // default `id` PK auto-increments). SQLite masks this — an INTEGER PRIMARY
  // KEY auto-fills via rowid — but MySQL/Postgres reject an INSERT that omits
  // the PK. The persisting tests below therefore supply explicit surrogate
  // keys; Rails' DB auto-increments them. Per-test ROLLBACK keeps id=1 free.

  // Rails `setup { @owner = Class.new(Owner) { def self.name; "Owner"; end } }`.
  // A fresh anonymous subclass per test so the `validates_size_of` declaration
  // does not leak across tests (Rails relies on the per-test class for this).
  function ownerClass(): typeof Owner {
    return class extends Owner {
      static name = "Owner";
    };
  }

  it("validates size of association", async () => {
    const owner = ownerClass();
    owner.validatesSizeOf("pets", { minimum: 1 });
    const o = new owner({ name: "nopets" });
    expect(await o.save()).toBe(false);
    expect(o.errors.get("pets").length).toBeGreaterThan(0);
    association(o, "pets").build({ name: "apet" });
    expect(await o.isValid()).toBe(true);
  });

  it("validates size of association using within", async () => {
    const owner = ownerClass();
    owner.validatesSizeOf("pets", { within: [1, 2] });
    const o = new owner({ name: "nopets" });
    expect(await o.save()).toBe(false);
    expect(o.errors.get("pets").length).toBeGreaterThan(0);

    association(o, "pets").build({ name: "apet" });
    expect(await o.isValid()).toBe(true);

    for (let i = 0; i < 2; i++) association(o, "pets").build({ name: "apet" });
    expect(await o.save()).toBe(false);
    expect(o.errors.get("pets").length).toBeGreaterThan(0);
  });

  it("validates size of association utf8", async () => {
    const owner = ownerClass();
    owner.validatesSizeOf("pets", { minimum: 1 });
    const o = new owner({ name: "あいうえおかきくけこ" });
    expect(await o.save()).toBe(false);
    expect(o.errors.get("pets").length).toBeGreaterThan(0);
    association(o, "pets").build({ name: "あいうえおかきくけこ" });
    expect(await o.isValid()).toBe(true);
  });

  it("validates size of respects records marked for destruction", async () => {
    const owner = ownerClass();
    owner.validatesSizeOf("pets", { minimum: 1 });
    const o = new owner({ owner_id: 1 }); // explicit surrogate key — see note above
    expect(await o.save()).toBe(false);
    expect(o.errors.get("pets").length).toBeGreaterThan(0);
    const pet = association(o, "pets").build({ pet_id: 1 });
    expect(await o.isValid()).toBe(true);
    expect(await o.save()).toBe(true);

    const petCount = await Pet.count();
    expect(await o.update({ petsAttributes: [{ _destroy: 1, id: pet.id }] })).toBe(false);
    expect(await o.isValid()).toBe(false);
    expect(o.errors.get("pets").length).toBeGreaterThan(0);
    expect(await Pet.count()).toBe(petCount);
  });

  it("validates length of virtual attribute on model", async () => {
    // Rails `Pet.attr_accessor(:nickname)` — an in-memory, non-column attribute.
    // The TS mirror is `attribute(..., { virtual: true })`: it installs the
    // name accessor and is read for validation like any attribute, but is
    // excluded from `column_names` so it is never persisted.
    const pet = class extends Pet {
      static name = "Pet";
      static {
        this.attribute("nickname", "string", { virtual: true });
        this.validatesLengthOf("name", { minimum: 1 });
        this.validatesLengthOf("nickname", { minimum: 1 });
      }
    };
    registerModel("Pet", pet);
    // Mirrors Rails `repair_validations(Pet) do ... end` — restore the canonical
    // Pet in the registry afterward so the subclass (carrying the extra
    // validations + virtual attr) can't leak into another suite in this worker.
    try {
      // pet_id is an explicit surrogate key — see the note above beforeAll.
      const p = await pet.create({ pet_id: 1, name: "Fancy Pants", nickname: "Fancy" });
      expect(await p.isValid()).toBe(true);
      (p as unknown as { nickname: string }).nickname = "";
      expect(await p.isValid()).toBe(false);
    } finally {
      registerModel("Pet", Pet);
    }
  });
});
