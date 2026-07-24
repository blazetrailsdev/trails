/**
 * TypeScript-only coverage for autosave association callbacks: cases Rails has
 * no test for because they are indistinguishable there (its association reader
 * is synchronous, so a cold cache is invisible to callback code).
 */
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

  // Rails' `after_save :trace_after_save, if: :iris` reads the association
  // through the plain reader, which loads the target from the DB when the
  // cache is cold (Association#load_target — `find_target?` only skips the
  // query while the owner is *building*). So an Eye fetched fresh and saved
  // without anyone touching `iris` still pushes onto the stacks.
  it("callbacks read a cold has_one cache", async () => {
    const created = await Eye.create({ irisAttributes: { color: "honey" } });
    const eye = await Eye.find(created.id);
    expect(eye.association("iris").isLoaded()).toBe(false);

    await eye.save();

    expect(eye.afterSaveCallbacksStack).toEqual([false, false]);
  });
});
