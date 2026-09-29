import { describe, it, expect } from "vitest";

import { Face } from "../test-helpers/models/face.js";
import { Human } from "../test-helpers/models/human.js";
import { _loadSingularViaStatementCache, registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import type { Base } from "../base.js";

interface AssociationLike {
  target: unknown;
}

const association = (record: Base, name: string): AssociationLike =>
  (record as unknown as { association(name: string): AssociationLike }).association(name);

describe("Association#find_target statement-cache execute block", () => {
  const { faces } = fixtures(["faces", "humans"]);

  it("sets the inverse instance and strict loading on each record it instantiates", async () => {
    registerModel(Face);
    registerModel(Human);
    const face = await Face.find(faces("trusting").id);
    face.strictLoadingBang(false, { mode: "n_plus_one_only" });

    const reflection = (Face as unknown as typeof Base)._reflectOnAssociation("human");
    const human = await _loadSingularViaStatementCache(
      face,
      "human",
      reflection as never,
      Human as unknown as typeof Base,
    );

    expect(human).not.toBeNull();
    expect(association(human!, "face").target).toBe(face);
    expect(human!.strictLoadingMode()).toBe("n_plus_one_only");
  });
});
