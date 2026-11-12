import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { SingularAssociation } from "../../../lib/associations/singular-association.js";
import { assertNothingRaised } from "@blazetrails/activesupport/testing/assertions";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Human } from "../../models/human.js";
import { Interest } from "../../models/interest.js";
import { Face } from "../../models/face.js";

constSet(TopLevel, "Interest", Interest);
constSet(TopLevel, "Human", Human);
fixtures({});

describe("AbsenceValidationTest", () => {
  it("non association", async () => {
    class Boy extends Human {
      static name = "Boy";
    }
    Boy.validatesAbsenceOf("name");

    expect(await new Boy().isValid()).toBeTruthy();
    expect(await new Boy({ name: "Alex" }).isValid()).toBeFalsy();
  });
  it("has one marked for destruction", async () => {
    class Boy extends Human {
      static name = "Boy";
    }
    Boy.validatesAbsenceOf("face");

    const boy = new Boy();
    const face = new Face();
    await (boy.association("face") as SingularAssociation).writer(face);
    expect(await boy.isValid()).toBeFalsy();
    expect(boy.errors.messagesFor("face").length).toEqual(1);

    face.markForDestruction();
    expect(await boy.isValid()).toBeTruthy();
  });
  it("has many marked for destruction", async () => {
    class Boy extends Human {
      static name = "Boy";
    }
    Boy.validatesAbsenceOf("interests");
    const boy = new Boy();
    const i1 = new Interest();
    const i2 = new Interest();
    await boy.interests.push(i1, i2);
    expect(await boy.isValid()).toBeFalsy();

    i1.markForDestruction();
    expect(await boy.isValid()).toBeFalsy();

    i2.markForDestruction();
    expect(await boy.isValid()).toBeTruthy();
  });
  it("does not call to a on associations", async () => {
    class Boy extends Human {
      static name = "Boy";
    }
    Boy.validatesAbsenceOf("face");

    const face_with_to_a = new Face();
    (face_with_to_a as unknown as { toA: () => string[] }).toA = () => ["(/)", "(\\)"];

    await assertNothingRaised(() => new Boy({ face: face_with_to_a }).isValid());
  });
  it("validates absence of virtual attribute on model", async () => {
    class VirtualInterest extends Interest {
      static {
        this.attribute("token", "string");
        this.validatesAbsenceOf("token");
      }
    }

    const interest = await VirtualInterest.createBang({ topic: "Thought Leadering" });
    expect(await interest.isValid()).toBeTruthy();

    (interest as unknown as { token: string }).token = "tl";

    expect(await interest.isInvalid()).toBeTruthy();
  });
});
