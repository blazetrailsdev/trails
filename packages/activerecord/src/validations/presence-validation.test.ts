/**
 * Mirrors: activerecord/test/cases/validations/presence_validation_test.rb
 *
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Base, registerModel } from "../index.js";
import { association } from "../associations.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { repairValidations } from "../test-helpers/repair-validations.js";
import { Human } from "../test-helpers/models/human.js";
import { Face } from "../test-helpers/models/face.js";
import { Interest } from "../test-helpers/models/interest.js";
import { Speedometer } from "../test-helpers/models/speedometer.js";
import { Dashboard } from "../test-helpers/models/dashboard.js";
import { seedAssociationCache } from "../test-helpers/seed-association-cache.js";

// Rails `class Boy < Human; end` — a plain subclass sharing the humans table.
class Boy extends Human {
  static name = "Boy";
}

// In-memory has_one / belongs_to assignment, mirroring Rails' `record.face = f`
// / `s.dashboard = dash`. These canonical models are schema-introspected and
// expose no generated `face=` / `dashboard=` *property* accessor (unlike
// has_many, which yields a real CollectionProxy — see test 4), so a plain
// `record.face = f` would set an own data property the validator never reads.
// The only real setters are the low-level `setHasOne` / `setBelongsTo`, but
// those issue a findBy + save against the target table, side effects Rails'
// in-memory setter skips for a brand-new (unsaved, null-PK) owner. Writing the
// association cache directly — the same idiom autosave-association.test.ts uses
// via its `cacheAssoc` helper — is the faithful in-memory mirror: presence
// reads it through read_attribute_for_validation's `_associationCache` lookup.
function setAssoc(record: Base, name: string, value: unknown) {
  seedAssociationCache(record, name, value);
}

describe("PresenceValidationTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  beforeAll(async () => {
    await defineSchema({
      humans: TEST_SCHEMA.humans,
      faces: TEST_SCHEMA.faces,
      interests: TEST_SCHEMA.interests,
      speedometers: TEST_SCHEMA.speedometers,
      dashboards: TEST_SCHEMA.dashboards,
    });
    registerModel("Human", Human);
    registerModel("Boy", Boy);
    registerModel("Face", Face);
    registerModel("Interest", Interest);
    registerModel("Speedometer", Speedometer);
    registerModel("Dashboard", Dashboard);
  });

  // Rails `repair_validations(Boy)` — clear validators added to Boy after
  // each test so the per-test `validates_presence_of` does not leak.
  afterEach(() => {
    Boy.clearValidatorsBang();
  });

  it("validates presence of non association", async () => {
    Boy.validatesPresenceOf("name");
    const b = new Boy();
    expect(await b.isInvalid()).toBe(true);

    // Rails `b.name = "Alex"`. The canonical Human model exposes its schema
    // columns through writeAttribute rather than a generated `name=` accessor.
    b.writeAttribute("name", "Alex");
    expect(await b.isValid()).toBe(true);
  });

  it("validates presence of has one", async () => {
    Boy.validatesPresenceOf("face");
    const b = new Boy();
    expect(await b.isInvalid()).toBe(true);
    expect(b.errors.get("face").length).toBe(1);
  });

  it("validates presence of has one marked for destruction", async () => {
    Boy.validatesPresenceOf("face");
    const b = new Boy();
    const f = new Face();
    setAssoc(b, "face", f);
    expect(await b.isValid()).toBe(true);

    f.markForDestruction();
    expect(await b.isInvalid()).toBe(true);
  });

  it("validates presence of has many marked for destruction", async () => {
    Boy.validatesPresenceOf("interests");
    const b = new Boy();
    const i1 = new Interest();
    const i2 = new Interest();
    // Rails `b.interests << [i1, i2]`. has_many yields a real CollectionProxy,
    // so we use its setter (concat) rather than poking the association cache.
    await association(b, "interests").concat(i1, i2);
    expect(await b.isValid()).toBe(true);

    i1.markForDestruction();
    expect(await b.isValid()).toBe(true);

    i2.markForDestruction();
    expect(await b.isInvalid()).toBe(true);
  });

  it("validates presence doesnt convert to array", async () => {
    const speedometer = class extends Speedometer {
      static name = "Speedometer";
    };
    speedometer.validatesPresenceOf("dashboard");

    const dash = new Dashboard();
    const s = new speedometer();
    setAssoc(s, "dashboard", dash);

    // Rails defines `def dash.to_a; …; end` to prove presence validation never
    // coerces a single associated record through `to_a`. Our AR PresenceValidator
    // wraps with `Array.isArray(value) ? value : [value]` and never calls any
    // `to_a`/`toA`, so the regression cannot recur in JS — Rails
    // `assert_nothing_raised { s.valid? }`.
    expect(await s.isValid()).toBe(true);
  });

  it("validates presence of virtual attribute on model", async () => {
    await repairValidations(Interest, async () => {
      Interest.attribute("abbreviation", "string", { virtual: true });
      Interest.validatesPresenceOf("topic");
      Interest.validatesPresenceOf("abbreviation");

      const interest = await Interest.createBang({
        topic: "Thought Leadering",
        abbreviation: "tl",
      });
      expect(await interest.isValid()).toBe(true);

      // Rails `interest.abbreviation = ""`. Calling `attribute()` at runtime here
      // (inside repairValidations) defines a real get/set accessor on the
      // prototype, so this assignment routes through writeAttribute — readAttribute
      // and read_attribute_for_validation then see "", exactly like Rails'
      // attr_accessor-backed reader.
      (interest as unknown as { abbreviation: string }).abbreviation = "";

      expect(await interest.isInvalid()).toBe(true);
    });
  });

  it("validations run on persisted record", async () => {
    await repairValidations(Interest, async () => {
      const interest = new Interest();
      await interest.saveBang();
      expect(await interest.isValid()).toBe(true);

      Interest.validatesPresenceOf("topic");

      expect(await interest.isValid()).toBe(false);
    });
  });

  it("validates presence with on context", async () => {
    await repairValidations(Interest, async () => {
      Interest.validatesPresenceOf("topic", { on: "required_name" });
      const interest = new Interest();
      await interest.saveBang();
      expect(await interest.isValid("required_name")).toBe(false);
    });
  });
});
