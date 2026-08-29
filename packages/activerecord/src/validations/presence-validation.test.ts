import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Base, registerModel } from "../index.js";
import { association } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { repairValidations } from "../cases/validations-repair-helper.js";
import { Human } from "../test-helpers/models/human.js";
import { Face } from "../test-helpers/models/face.js";
import { Interest } from "../test-helpers/models/interest.js";
import { Speedometer } from "../test-helpers/models/speedometer.js";
import { Dashboard } from "../test-helpers/models/dashboard.js";

class Boy extends Human {
  static name = "Boy";
}

function setAssoc(record: Base, name: string, value: unknown): unknown {
  return (record as unknown as { association(n: string): { writer(v: unknown): unknown } })
    .association(name)
    .writer(value);
}

describe("PresenceValidationTest", () => {
  fixtures([]);

  beforeAll(async () => {
    registerModel("Human", Human);
    registerModel("Boy", Boy);
    registerModel("Face", Face);
    registerModel("Interest", Interest);
    registerModel("Speedometer", Speedometer);
    registerModel("Dashboard", Dashboard);
  });

  afterEach(() => {
    Boy.clearValidatorsBang();
  });

  it("validates presence of non association", async () => {
    Boy.validatesPresenceOf("name");
    const b = new Boy();
    expect(await b.isInvalid()).toBe(true);

    b.writeAttribute("name", "Alex");
    expect(await b.isValid()).toBe(true);
  });

  it("validates presence of has one", async () => {
    Boy.validatesPresenceOf("face");
    const b = new Boy();
    expect(await b.isInvalid()).toBe(true);
    expect(b.errors.messagesFor("face").length).toBe(1);
  });

  it("validates presence of has one marked for destruction", async () => {
    Boy.validatesPresenceOf("face");
    const b = new Boy();
    const f = new Face();
    await setAssoc(b, "face", f);
    expect(await b.isValid()).toBe(true);

    f.markForDestruction();
    expect(await b.isInvalid()).toBe(true);
  });

  it("validates presence of has many marked for destruction", async () => {
    Boy.validatesPresenceOf("interests");
    const b = new Boy();
    const i1 = new Interest();
    const i2 = new Interest();
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
    await setAssoc(s, "dashboard", dash);

    expect(await s.isValid()).toBe(true);
  });

  it("validates presence of virtual attribute on model", async () => {
    await repairValidations(Interest, async () => {
      Interest.attribute("abbreviation", "string");
      Interest.validatesPresenceOf("topic");
      Interest.validatesPresenceOf("abbreviation");

      const interest = await Interest.createBang({
        topic: "Thought Leadering",
        abbreviation: "tl",
      });
      expect(await interest.isValid()).toBe(true);

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
