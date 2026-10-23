import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Configurable,
  MemoryStore,
  Notifications,
  extend,
  include,
  type Extended,
} from "@blazetrails/activesupport";
import { ConfigMethods } from "../caching.js";

import {
  combinedFragmentCacheKey,
  expireFragment,
  fragmentCacheKey,
  Fragments,
  fragmentExist,
  instrumentFragmentCache,
  readFragment,
  writeFragment,
  type FragmentsClassMethods,
  type FragmentsHost,
} from "./fragments.js";

class HostClass {
  static fragmentCacheKeys: Array<(this: FragmentsHost) => unknown> | undefined;

  account = { id: 7 };
  urlFor(o: Record<string, unknown>) {
    return `http://test.host/${o.controller}/${o.action}/${o.id ?? ""}`;
  }
  instrumentPayload(key: unknown) {
    return { key };
  }
  instrumentName() {
    return "action_controller";
  }
}

include(HostClass, Configurable);
const HostConfigurable = HostClass as typeof HostClass & Extended<typeof Configurable.ClassMethods>;
include(HostClass, ConfigMethods);
extend(HostClass, ConfigMethods);
HostConfigurable.configAccessor("performCaching");

const HostConfig = HostClass as unknown as typeof HostClass & {
  cacheStore: unknown;
  performCaching: boolean;
};

function makeHost(store?: MemoryStore): HostClass & FragmentsHost {
  HostConfigurable.config().clear();
  if (store) HostConfig.cacheStore = store;
  HostConfig.performCaching = true;
  HostClass.fragmentCacheKeys = [];
  return new HostClass() as unknown as HostClass & FragmentsHost;
}

const origCache = process.env.RAILS_CACHE_ID;
const origVer = process.env.RAILS_APP_VERSION;
beforeEach(async () => {
  delete process.env.RAILS_CACHE_ID;
  delete process.env.RAILS_APP_VERSION;
});
afterEach(async () => {
  if (origCache === undefined) delete process.env.RAILS_CACHE_ID;
  else process.env.RAILS_CACHE_ID = origCache;
  if (origVer === undefined) delete process.env.RAILS_APP_VERSION;
  else process.env.RAILS_APP_VERSION = origVer;
});

describe("class config", () => {
  it("fragmentCacheKey appends constants-as-thunks and blocks in order", async () => {
    const cls: FragmentsClassMethods = { fragmentCacheKeys: [() => "a"] };
    fragmentCacheKey.call(cls, "b");
    fragmentCacheKey.call(cls, undefined, function (this: FragmentsHost) {
      return 42;
    });
    expect(cls.fragmentCacheKeys!.map((f) => f.call({} as FragmentsHost))).toEqual(["a", "b", 42]);
  });
});

describe("included", () => {
  it("gives a class its own fragment_cache_keys through class_attribute", async () => {
    class Parent {}
    include(Parent, Fragments);
    class Child extends Parent {}
    const parent = Parent as unknown as { fragmentCacheKeys: unknown[] };
    const child = Child as unknown as { fragmentCacheKeys: unknown[] };
    child.fragmentCacheKeys = ["child"];
    expect(parent.fragmentCacheKeys).toEqual([]);
    expect(child.fragmentCacheKeys).toEqual(["child"]);
  });
});

describe("combinedFragmentCacheKey", () => {
  it("prepends :views, includes RAILS_CACHE_ID || RAILS_APP_VERSION, drops nulls", async () => {
    expect(combinedFragmentCacheKey.call(makeHost(), "n")).toEqual(["views", "n"]);

    process.env.RAILS_APP_VERSION = "1.2.3";
    expect(combinedFragmentCacheKey.call(makeHost(), "n")).toEqual(["views", "1.2.3", "n"]);

    process.env.RAILS_CACHE_ID = "deploy-42";
    expect(combinedFragmentCacheKey.call(makeHost(), "n")).toEqual(["views", "deploy-42", "n"]);
  });

  it("falls through empty-string env vars (|| semantics, not ??)", async () => {
    process.env.RAILS_CACHE_ID = "";
    process.env.RAILS_APP_VERSION = "1.2.3";
    expect(combinedFragmentCacheKey.call(makeHost(), "n")).toEqual(["views", "1.2.3", "n"]);

    process.env.RAILS_APP_VERSION = "";
    expect(combinedFragmentCacheKey.call(makeHost(), "n")).toEqual(["views", "n"]);
  });

  it("throws when a hash key is given without a host urlFor", async () => {
    const host = makeHost();
    (host as { urlFor?: unknown }).urlFor = undefined;
    expect(() => combinedFragmentCacheKey.call(host, { a: 1 })).toThrow(/requires a host/);
  });

  it("throws when host urlFor returns a non-string", async () => {
    const host = makeHost();
    host.urlFor = () => 123 as unknown as string;
    expect(() => combinedFragmentCacheKey.call(host, { a: 1 })).toThrow(/must return a string/);
  });

  it("evaluates prefix blocks in instance scope and flattens one level", async () => {
    const host = makeHost();
    HostClass.fragmentCacheKeys = [
      function (this: FragmentsHost) {
        return (this as unknown as HostClass).account.id;
      },
      () => ["a", "b"],
    ];
    expect(combinedFragmentCacheKey.call(host, ["c", "d"])).toEqual([
      "views",
      7,
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("treats a plain-object key as urlFor and strips the scheme", async () => {
    expect(
      combinedFragmentCacheKey.call(makeHost(), { controller: "pages", action: "notes", id: 45 }),
    ).toEqual(["views", "test.host/pages/notes/45"]);
  });
});

describe("read/write/expire fragment", () => {
  let host: HostClass & FragmentsHost;
  beforeEach(async () => {
    host = makeHost(new MemoryStore());
  });

  it("round-trips content, reports existence, and expires by key", async () => {
    expect(await fragmentExist.call(host, "n")).toBe(false);
    expect(await writeFragment.call(host, "n", "body")).toBe("body");
    expect(String(await readFragment.call(host, "n"))).toBe("body");
    expect(await fragmentExist.call(host, "n")).toBe(true);
    await expireFragment.call(host, "n");
    expect(await readFragment.call(host, "n")).toBeNull();
  });

  it("RegExp expiry delegates to deleteMatched", async () => {
    await writeFragment.call(host, "pages/45/notes", "a");
    await writeFragment.call(host, "pages/46/notes", "b");
    await writeFragment.call(host, "other", "c");
    await expireFragment.call(host, /pages\/\d+\/notes/);
    expect(await readFragment.call(host, "pages/45/notes")).toBeNull();
    expect(String(await readFragment.call(host, "other"))).toBe("c");
  });

  it("write_fragment converts the body with to_str and raises for a non-string body", async () => {
    const stringLike = { toStr: () => "converted" };
    expect(await writeFragment.call(host, "n", stringLike)).toBe("converted");
    expect(String(await readFragment.call(host, "n"))).toBe("converted");
    await expect(writeFragment.call(host, "m", 42)).rejects.toThrow(
      "undefined method 'to_str' for 42",
    );
    expect(await readFragment.call(host, "m")).toBeNull();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("forwards options to exist?, delete and delete_matched", async () => {
    const store = HostConfig.cacheStore as MemoryStore;
    const exist = vi.spyOn(store, "exist");
    const del = vi.spyOn(store, "delete");
    const deleteMatched = vi.spyOn(store, "deleteMatched");
    await fragmentExist.call(host, "n", { namespace: "ns" });
    await expireFragment.call(host, "n", { namespace: "ns" });
    await expireFragment.call(host, /n/, { namespace: "ns" });
    expect(exist).toHaveBeenCalledWith(["views", "n"], { namespace: "ns" });
    expect(del).toHaveBeenCalledWith(["views", "n"], { namespace: "ns" });
    expect(deleteMatched).toHaveBeenCalledWith(/n/, { namespace: "ns" });
  });

  it("returns content / undefined when caching is not configured", async () => {
    HostConfig.performCaching = false;
    expect(await writeFragment.call(host, "n", "body")).toBe("body");
    expect(await readFragment.call(host, "n")).toBeUndefined();
    expect(await fragmentExist.call(host, "n")).toBeUndefined();
    expect(await expireFragment.call(host, "n")).toBeUndefined();
  });
});

describe("instrumentFragmentCache", () => {
  it("fires under the host's instrumentName with its instrumentPayload", async () => {
    const host = makeHost();
    host.instrumentName = () => "pages_controller";
    host.instrumentPayload = (key) => ({ key, controller: "Pages" });
    const sub = vi.fn();
    const h = Notifications.subscribe("read_fragment.pages_controller", sub);
    try {
      expect(instrumentFragmentCache.call(host, "read_fragment", "k", () => "ok")).toBe("ok");
      expect(sub.mock.calls[0][4]).toEqual({ key: "k", controller: "Pages" });
    } finally {
      Notifications.unsubscribe(h);
    }
  });

  it("raises when the host does not answer instrumentName", async () => {
    const host = makeHost() as unknown as { instrumentName?: unknown };
    host.instrumentName = undefined;
    expect(() =>
      instrumentFragmentCache.call(host as FragmentsHost, "read_fragment", "k", () => null),
    ).toThrow(TypeError);
  });
});
