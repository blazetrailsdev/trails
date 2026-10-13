import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Face } from "../test-helpers/models/face.js";
import { Human } from "../test-helpers/models/human.js";
import { Interest } from "../test-helpers/models/interest.js";
import type { HasOneAssociation } from "./has-one-association.js";

describe("InversePolymorphicBelongsToTests", () => {
  fixtures(["humans", "faces", "interests"]);
  beforeAll(() => {
    [Human, Face, Interest].forEach((m) => registerModel(m));
  });

  it("has_one createBang stores a single record as target, not an array", async () => {
    const human = await Human.createBang({});
    const holder = human.association("autosaveFace") as HasOneAssociation;
    const face = (await holder.createBang({ description: "haunted" })) as Face;

    expect(Array.isArray(holder.target)).toBe(false);
    expect(holder.target).toBe(face);

    face.description = "new description";
    await human.saveBang();
    await face.reload();
    expect(face.description).toBe("new description");
  });
});
