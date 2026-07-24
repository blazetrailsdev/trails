import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "./index.js";
import { Eye, Iris, IrisWithReadOnlyForeignKey } from "./test-helpers/models/eye.js";
import { fixtures } from "./test-helpers/fixtures.js";

describe("TestDefaultAutosaveAssociationOnAHasOneAssociation", () => {
  fixtures([]);
  beforeAll(() => {
    registerModel(Eye);
    registerModel(Iris);
    registerModel(IrisWithReadOnlyForeignKey);
  });

  it("callbacks read a cold has_one cache", async () => {
    const created = await Eye.create({ irisAttributes: { color: "honey" } });
    const eye = await Eye.find(created.id);
    expect(eye.association("iris").isLoaded()).toBe(false);

    await eye.save();

    expect(eye.association("iris").isLoaded()).toBe(true);
    expect(eye.afterSaveCallbacksStack).toEqual([false, false]);
  });
});
