import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { fixtures } from "../../../support/use-fixtures.js";
import { Preloader } from "../../../../lib/associations/preloader.js";
import { LoaderRecords } from "../../../../lib/associations/preloader/association.js";
import type { Association } from "../../../../lib/associations/preloader/association.js";
import type { Base } from "../../../../lib/base.js";
import { Author } from "../../../models/author.js";
import { CpkOrder } from "../../../models/cpk.js";

constSet(TopLevel, "Author", Author);

describe("Preloader::Association::LoaderRecords", () => {
  const { authors, cpkOrders } = fixtures(["authors", "posts", "cpkOrders", "cpkBooks"]);

  const keyFor = (loader: Association, owner: Base): unknown =>
    [...loader.ownersByKey.entries()].find(([, owners]) => owners.includes(owner))![0];

  it("keeps a key whose owner is already loaded out of keys_to_load", async () => {
    const david = authors("david");
    const mary = authors("mary");

    const davidPosts = await david.posts;
    expect(davidPosts.length).toBeGreaterThan(0);

    const [loader] = await new Preloader({
      records: [david, mary],
      associations: ["posts"],
      associateByDefault: false,
    }).loaders();

    const loaderRecords = new LoaderRecords([loader], loader.loaderQuery());

    expect(loaderRecords.keysToLoad.has(keyFor(loader, mary))).toBe(true);
    expect(loaderRecords.keysToLoad.has(keyFor(loader, david))).toBe(false);
    expect(loaderRecords.alreadyLoadedRecordsByKey.get(keyFor(loader, david))).toEqual(davidPosts);
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

    const records = await new LoaderRecords([loader], loader.loaderQuery()).records();

    for (const post of davidPosts) {
      expect(records).toContain(post);
    }
    expect(records.length).toBeGreaterThan(davidPosts.length);
  });

  it("keeps a composite key shared by two loaders out of keys_to_load when one owner is loaded", async () => {
    const loadedOrder = cpkOrders("cpk_groceries_order_1");
    const unloadedOrder = await CpkOrder.find(loadedOrder.id as unknown[]);
    await loadedOrder.books;

    const loaders = [];
    for (const order of [unloadedOrder, loadedOrder]) {
      const [loader] = await new Preloader({
        records: [order],
        associations: ["books"],
        associateByDefault: false,
      }).loaders();
      loaders.push(loader);
    }

    const sharedKey = keyFor(loaders[0], unloadedOrder);
    expect(keyFor(loaders[1], loadedOrder)).not.toBe(sharedKey);

    const loaderRecords = new LoaderRecords(loaders, loaders[0].loaderQuery());

    expect(loaderRecords.keysToLoad.size).toBe(0);
  });
});
