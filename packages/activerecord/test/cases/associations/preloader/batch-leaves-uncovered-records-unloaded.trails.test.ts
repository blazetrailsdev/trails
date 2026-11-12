import { describe, it, expect } from "vitest";
import { fixtures } from "../../../support/use-fixtures.js";
import "../../../support/canonical-model-index.js";
import { assertNoQueries } from "../../../../lib/testing/query-assertions.js";
import { Preloader } from "../../../../lib/associations/preloader.js";
import { Tagging } from "../../../models/tagging.js";

describe("Preloader::Batch", () => {
  fixtures(["taggings", "posts"]);

  it("leaves a polymorphic belongs_to with no type unloaded, and it reads nil without a query", async () => {
    const tagging = (await Tagging.createBang({
      taggable_type: null,
      taggable_id: null,
    })) as unknown as Tagging & {
      taggable: Promise<unknown>;
      association(name: string): { isLoaded(): boolean };
    };

    await assertNoQueries(false, async () => {
      await new Preloader({ records: [tagging], associations: "taggable" }).call();
    });

    expect(tagging.association("taggable").isLoaded()).toBe(false);
    await assertNoQueries(false, async () => {
      expect(await tagging.taggable).toBeNull();
    });
  });
});
