import { describe, it, expect, beforeAll } from "vitest";
import type { HasOneAssociation } from "./has-one-association.js";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Human } from "../test-helpers/models/human.js";
import { Face } from "../test-helpers/models/face.js";
import { Interest } from "../test-helpers/models/interest.js";

describe("InversePolymorphicBelongsToTests", () => {
  fixtures(["humans", "faces", "interests"]);
  beforeAll(() => {
    [Human, Face, Interest].forEach((m) => registerModel(m));
  });

  it("has_one createBang stores a single record as target, not an array", async () => {
    const human = await Human.createBang({});
    const face = (await (human.association("autosaveFace") as HasOneAssociation).createBang({
      description: "haunted",
    })) as Face;

    const holder = human.association("autosaveFace");
    expect(Array.isArray(holder.target)).toBe(false);
    expect(holder.target).toBe(face);

    face.description = "new description";
    await human.saveBang();
    await face.reload();
    expect(face.description).toBe("new description");
  });
});
