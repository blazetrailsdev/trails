/**
 * Trails-only surface: removal of a has_one record displaced by the
 * *synchronous* build path.
 *
 * Rails' `HasOneAssociation#set_new_record` -> `replace(record, false)` runs
 * `remove_target!` inline (has_one_association.rb:68-69, 91-92), including the
 * persisted nullify `target.save` at :108. A synchronous JS builder cannot
 * await that write, so `setNewRecord` performs only the in-memory half; every
 * caller that can displace a persisted record issues the DB half itself. The
 * `build#{Name}` / `create#{Name}` accessors use `detachDisplacedTarget`. For
 * `assoc.build()`, which nested attributes calls directly, the nested-attributes
 * writer uses `removeDisplacedRecord` — starting the removal inline at
 * assignment and awaiting it in its `save` wrapper before the replacement is
 * inserted.
 *
 * Rails' own `test_should_replace_an_existing_record_if_there_is_no_id`
 * (nested_attributes_test.rb:288) asserts only in-memory state and never saves
 * the owner, so it does not cover the displaced row — hence this trails-only
 * guard rather than a change to the mirrored test.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, type Base } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Pirate } from "../test-helpers/models/pirate.js";
import { Ship } from "../test-helpers/models/ship.js";

describe("has_one displacement via the synchronous build path", () => {
  fixtures(["pirates", "ships"]);

  beforeAll(() => {
    registerModel(Pirate);
    registerModel(Ship);
  });

  it("nullifies the displaced row when nested attributes replace a loaded child", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    const displaced = (await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    })) as Base;

    // Load the association so `setNewRecord` sees a loaded, persisted target —
    // the case where Rails' `remove_target!` has a row to nullify.
    await (pirate as unknown as { ship: Promise<Base | null> }).ship;

    (pirate as unknown as { shipAttributes: unknown }).shipAttributes = {
      name: "Davy Jones Gold Dagger",
    };
    await pirate.save();

    const reloaded = (await Ship.find((displaced as unknown as { id: number }).id)) as Base;
    expect((reloaded as unknown as { pirate_id: number | null }).pirate_id).toBe(null);
  });
});
