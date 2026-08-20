/**
 * Trails-only surface: `Preloader::Association#associate_records_to_owner`
 * partitions the existing target with `reject(&:persisted?)`
 * (`preloader/association.rb:251`), so a DESTROYED record — neither new nor
 * persisted — survives the preload writeback. trails used to spell that
 * partition `isNewRecord()` on a proxy-side `_hydrateFromPreload` hook, which
 * dropped the destroyed record; Ruby cannot drift this way (there is one
 * writeback, through `Association#target=`, `association.rb:100-103`), so there
 * is no Rails test to mirror and the coverage lives here.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../../index.js";
import { fixtures } from "../../test-fixtures.js";
import { Preloader } from "../preloader.js";
import { Post } from "../../test-helpers/models/post.js";
import { Comment } from "../../test-helpers/models/comment.js";

registerModel(Post);
registerModel(Comment);

describe("Preloader::Association#associate_records_to_owner not-persisted records", () => {
  const { posts } = fixtures(["posts", "comments"]);

  it("keeps a destroyed record on the target through the preload writeback", async () => {
    const post = await Post.find(posts("welcome").id);
    const comments = await post.comments;
    const doomed = comments[0];
    await doomed.destroy();

    expect(doomed.isPersisted()).toBe(false);
    expect(doomed.isNewRecord()).toBe(false);

    const association = post.association("comments") as unknown as {
      loaded: boolean;
      target: Comment[];
    };
    association.loaded = false;
    await new Preloader({ records: [post], associations: "comments" }).call();

    expect(association.target).toContain(doomed);
  });
});
