import { describe, it, expect } from "vitest";
import { registerModel } from "../../index.js";
import { fixtures } from "../../test-fixtures.js";
import { Preloader } from "../preloader.js";
import { Author } from "../../test-helpers/models/author.js";
import { Post } from "../../test-helpers/models/post.js";

registerModel(Author);
registerModel(Post);

describe("Preloader::Association#preloaded_records forcing", () => {
  const { authors } = fixtures(["authors", "posts"]);

  it("loads the records when read before the batch runs the loader", async () => {
    const david = authors("david");
    const [loader] = await new Preloader({
      records: [david],
      associations: ["posts"],
      associateByDefault: false,
    }).loaders();

    expect(loader.isRun()).toBe(false);

    const records = await loader.preloadedRecords();

    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record instanceof Post)).toBe(true);
  });

  it("does not re-run the query for an empty preload", async () => {
    const david = authors("david");
    const [loader] = await new Preloader({
      records: [david],
      associations: ["posts"],
      associateByDefault: false,
    }).loaders();

    await loader.loadRecords([]);
    const queryCount = { n: 0 };
    const original = loader.loadRecords.bind(loader);
    loader.loadRecords = async (...args: Parameters<typeof original>) => {
      queryCount.n += 1;
      return original(...args);
    };

    expect(await loader.preloadedRecords()).toEqual([]);
    expect(queryCount.n).toBe(0);
  });
});
