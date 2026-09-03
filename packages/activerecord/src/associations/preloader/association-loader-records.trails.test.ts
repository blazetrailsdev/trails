import { describe, it, expect } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { registerModel } from "../../index.js";
import { fixtures } from "../../test-fixtures.js";
import { Preloader } from "../preloader.js";
import { SQLCounter } from "../../testing/query-assertions.js";
import { Author } from "../../test-helpers/models/author.js";
import { Post } from "../../test-helpers/models/post.js";

registerModel(Author);
registerModel(Post);

describe("Preloader::Association::LoaderRecords", () => {
  const { authors } = fixtures(["authors", "posts"]);

  it("does not query for a key whose owner is already loaded", async () => {
    const david = authors("david");
    const mary = authors("mary");

    const davidPosts = await david.posts;
    expect(davidPosts.length).toBeGreaterThan(0);

    const counter = new SQLCounter();
    await Notifications.subscribed(counter, "sql.active_record", async () => {
      await new Preloader({ records: [david, mary], associations: ["posts"] }).call();
    });

    const boundValues = counter.logFull.flatMap(([, binds]) => binds);
    expect(boundValues).toContain(mary.id);
    expect(boundValues).not.toContain(david.id);

    expect((await mary.posts).every((post) => post instanceof Post)).toBe(true);
  });

  it("returns the already loaded records alongside the loaded ones", async () => {
    const david = authors("david");
    const mary = authors("mary");

    const davidPosts = await david.posts;

    const [loader] = await new Preloader({
      records: [david, mary],
      associations: ["posts"],
      associateByDefault: false,
    }).loaders();

    const records = await loader.loaderQuery().recordsFor([loader]);

    for (const post of davidPosts) {
      expect(records).toContain(post);
    }
  });
});
