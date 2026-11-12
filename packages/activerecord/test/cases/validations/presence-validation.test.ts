import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SingularAssociation } from "../../../lib/associations/singular-association.js";
import { Base } from "../../../lib/index.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { repairValidations } from "../../../lib/cases/validations-repair-helper.js";
import { Human } from "../../models/human.js";
import { Face } from "../../models/face.js";
import { Interest } from "../../models/interest.js";
import { Speedometer } from "../../models/speedometer.js";
import { Dashboard } from "../../models/dashboard.js";

class Boy extends Human {
  static name = "Boy";
}

function setAssoc(record: Base, name: string, value: Base | null): unknown {
  return (record.association(name) as SingularAssociation).writer(value);
}

describe("PresenceValidationTest", () => {
  fixtures([]);

  beforeAll(async () => {
    constSet(TopLevel, "Human", Human);
    constSet(TopLevel, "Boy", Boy);
    constSet(TopLevel, "Face", Face);
    constSet(TopLevel, "Interest", Interest);
    constSet(TopLevel, "Speedometer", Speedometer);
    constSet(TopLevel, "Dashboard", Dashboard);
  });

  afterEach(() => {
    Boy.clearValidatorsBang();
  });

  it("validates presence of non association", async () => {
    Boy.validatesPresenceOf("name");
    const b = new Boy();
    expect(await b.isInvalid()).toBeTruthy();

    b.writeAttribute("name", "Alex");
    expect(await b.isValid()).toBeTruthy();
  });

  it("validates presence of has one", async () => {
    Boy.validatesPresenceOf("face");
    const b = new Boy();
    expect(await b.isInvalid()).toBeTruthy();
    expect(b.errors.messagesFor("face").length).toBe(1);
  });

  it("validates presence of has one marked for destruction", async () => {
    Boy.validatesPresenceOf("face");
    const b = new Boy();
    const f = new Face();
    await setAssoc(b, "face", f);
    expect(await b.isValid()).toBeTruthy();

    f.markForDestruction();
    expect(await b.isInvalid()).toBeTruthy();
  });

  it("validates presence of has many marked for destruction", async () => {
    Boy.validatesPresenceOf("interests");
    const b = new Boy();
    const i1 = new Interest();
    const i2 = new Interest();
    await b.interests.concat(i1, i2);
    expect(await b.isValid()).toBeTruthy();

    i1.markForDestruction();
    expect(await b.isValid()).toBeTruthy();

    i2.markForDestruction();
    expect(await b.isInvalid()).toBeTruthy();
  });

  it("validates presence doesnt convert to array", async () => {
    const speedometer = class extends Speedometer {
      static name = "Speedometer";
    };
    speedometer.validatesPresenceOf("dashboard");

    const dash = new Dashboard();
    const s = new speedometer();
    await setAssoc(s, "dashboard", dash);

    await expect(s.isValid()).resolves.not.toThrow();
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
      expect(await interest.isValid()).toBeTruthy();

      (interest as unknown as { abbreviation: string }).abbreviation = "";

      expect(await interest.isInvalid()).toBeTruthy();
    });
  });

  it("validations run on persisted record", async () => {
    await repairValidations(Interest, async () => {
      const interest = new Interest();
      await interest.saveBang();
      expect(await interest.isValid()).toBeTruthy();

      Interest.validatesPresenceOf("topic");

      expect(await interest.isValid()).toBeFalsy();
    });
  });

  it("validates presence with on context", async () => {
    await repairValidations(Interest, async () => {
      Interest.validatesPresenceOf("topic", { on: "required_name" });
      const interest = new Interest();
      await interest.saveBang();
      expect(await interest.isValid("required_name")).toBeFalsy();
    });
  });
});
