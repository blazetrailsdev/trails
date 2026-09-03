import { describe, it, expect } from "vitest";
import { Club } from "./test-helpers/models/club.js";
import { Face } from "./test-helpers/models/face.js";

describe("ActiveRecord::Reflection#inverseName (trails)", () => {
  it("returns the stored inverse_of, so inverse_of: false answers false", () => {
    const reflection = Club._reflectOnAssociation("memberships")!;
    expect(reflection.inverseName()).toBe(false);
    expect(reflection.inverseOf()).toBe(null);
    expect(reflection.hasInverse()).toBe(false);
  });

  it("returns the stored inverse_of name when one is given", () => {
    const reflection = Face._reflectOnAssociation("human")!;
    expect(reflection.inverseName()).toBe("face");
  });
});
