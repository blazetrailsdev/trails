import { describe, it, expect } from "vitest";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Face } from "../../models/face.js";
import { Human } from "../../models/human.js";
import type { HasOneAssociation } from "../../../lib/associations/has-one-association.js";
import "../../models/interest.js";
import "../../models/face.js";

describe("InversePolymorphicBelongsToTests", () => {
  fixtures(["humans", "faces", "interests"]);

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
