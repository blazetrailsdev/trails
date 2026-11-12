import { describe, it, expect } from "vitest";
import type { AssociationReflection } from "../../lib/reflection.js";
import { Face } from "../models/face.js";
import { Human } from "../models/human.js";
import { InverseOfAssociationNotFoundError } from "../../lib/associations/errors.js";

describe("ActiveRecord::Reflection#polymorphicInverseOf (trails)", () => {
  it("looks the inverse up by options[:inverse_of]", () => {
    const reflection = Face._reflectOnAssociation("polymorphicHuman") as AssociationReflection;
    expect(reflection.polymorphicInverseOf(Human)).toBe(
      Human._reflectOnAssociation("polymorphicFace"),
    );
  });

  it("raises when the inverse is only automatic, so options[:inverse_of] is nil", () => {
    const reflection = Human._reflectOnAssociation(
      "polymorphicFaceWithoutInverse",
    ) as AssociationReflection;
    expect(reflection.hasInverse()).toBeTruthy();
    expect(() => reflection.polymorphicInverseOf(Face)).toThrow(InverseOfAssociationNotFoundError);
  });
});
