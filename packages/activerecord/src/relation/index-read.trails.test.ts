import { describe, it, expect } from "vitest";
import { Post } from "../test-helpers/models/post.js";
import { ShipPart } from "../test-helpers/models/ship-part.js";
import { Ship } from "../test-helpers/models/ship.js";
import { Treasure } from "../test-helpers/models/treasure.js";
import { fixtures } from "../test-fixtures.js";
import { registerModel } from "../index.js";

registerModel(ShipPart);
registerModel(Ship);
registerModel(Treasure);

describe("Relation#[] — delegated to records (delegation.rb:98-102)", () => {
  fixtures(["posts"]);

  it("loads an unloaded relation for an index read", async () => {
    const relation = Post.order("id") as unknown as {
      isLoaded: boolean;
      0: Promise<Post>;
      99999: Promise<Post | undefined>;
    };

    expect(relation.isLoaded).toBe(false);
    const first = relation[0];
    expect(first).toBeInstanceOf(Promise);
    expect((await first).id).toBe((await Post.order("id").first())!.id);
    expect(relation.isLoaded).toBe(true);
    expect(await Post.order("id")[99999 as never]).toBeUndefined();
  });

  it("reads a loaded relation's records synchronously", async () => {
    const relation = await Post.order("id").load();

    expect((relation as unknown as { 0: Post })[0]).toBeInstanceOf(Post);
  });

  it("reads an unsaved owner's in-memory collection target synchronously", () => {
    const part = new ShipPart();
    const trinket = part.trinkets.build({ name: "Necklace" });

    expect((part.trinkets as unknown as { 0: Treasure })[0]).toBe(trinket);
  });
});
