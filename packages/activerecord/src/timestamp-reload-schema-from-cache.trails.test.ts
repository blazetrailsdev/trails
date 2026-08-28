// Fidelity: ActiveRecord::Timestamp::ClassMethods#reload_schema_from_cache
// (timestamp.rb:84-89) nils the three timestamp-attribute memos and calls
// `super`, so it is the outermost link of the
// Timestamp -> Attributes -> ModelSchema override chain. This asserts the
// dispatch actually reaches it: with the Timestamp half unseated, the memos
// survive a schema reload and go stale.
import { describe, it, expect } from "vitest";
import { Toy } from "./test-helpers/models/toy.js";
import { fixtures } from "./test-fixtures.js";
import * as Timestamp from "./timestamp.js";

describe("timestamp reload_schema_from_cache", () => {
  fixtures(["toys"]);

  it("clears the memoized timestamp attributes", async () => {
    await Toy.first();

    expect(Timestamp.allTimestampAttributesInModel.call(Toy as never)).toEqual([
      "created_at",
      "updated_at",
    ]);
    const klass = Toy as unknown as Record<string, unknown>;
    expect(klass._allTimestampAttributesInModel).toBeDefined();
    expect(klass._timestampAttributesForCreateInModel).toBeDefined();
    expect(klass._timestampAttributesForUpdateInModel).toBeDefined();

    Toy.reloadSchemaFromCache();

    expect(klass._allTimestampAttributesInModel).toBeUndefined();
    expect(klass._timestampAttributesForCreateInModel).toBeUndefined();
    expect(klass._timestampAttributesForUpdateInModel).toBeUndefined();
  });
});
