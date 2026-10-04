import { describe, expect, it } from "vitest";
import { Branch } from "./branch.js";

describe("Preloader::Branch root control flow", () => {
  const root = () =>
    new Branch({
      parent: null,
      association: null,
      children: null,
      associateByDefault: true,
      scope: null,
    });

  it("source_records on a root branch reads the nil parent", async () => {
    await expect((async () => root().sourceRecords())()).rejects.toThrow(TypeError);
  });

  it("runnable_loaders on a root branch reads the nil parent", async () => {
    await expect(root().runnableLoaders()).rejects.toThrow(TypeError);
  });

  it("preloaded_records on a root branch has no dedicated error", async () => {
    await expect(root().preloadedRecords()).rejects.toThrow(TypeError);
  });
});
