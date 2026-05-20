import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, Notifications } from "@blazetrails/activesupport";

import {
  applyFragments,
  combinedFragmentCacheKey,
  expireFragment,
  fragmentCacheKey,
  fragmentExist,
  instrumentFragmentCache,
  readFragment,
  writeFragment,
  type FragmentsClassMethods,
  type FragmentsHost,
} from "./fragments.js";

class HostClass {
  static cacheStore: MemoryStore | null = null;
  static performCaching = true;
  static fragmentCacheKeys: Array<(this: FragmentsHost) => unknown> | undefined;

  account = { id: 7 };
  urlFor(o: Record<string, unknown>) {
    return `http://test.host/${o.controller}/${o.action}/${o.id ?? ""}`;
  }
}

function makeHost(store?: MemoryStore): HostClass & FragmentsHost {
  HostClass.cacheStore = store ?? null;
  HostClass.performCaching = true;
  HostClass.fragmentCacheKeys = [];
  return new HostClass() as unknown as HostClass & FragmentsHost;
}

const origCache = process.env.RAILS_CACHE_ID;
const origVer = process.env.RAILS_APP_VERSION;
beforeEach(() => {
  delete process.env.RAILS_CACHE_ID;
  delete process.env.RAILS_APP_VERSION;
});
afterEach(() => {
  if (origCache === undefined) delete process.env.RAILS_CACHE_ID;
  else process.env.RAILS_CACHE_ID = origCache;
  if (origVer === undefined) delete process.env.RAILS_APP_VERSION;
  else process.env.RAILS_APP_VERSION = origVer;
});

describe("class config", () => {
  it("applyFragments is a no-op so subclasses inherit the parent key list", () => {
    class Parent {
      static fragmentCacheKeys = [() => "v1"];
    }
    class Child extends Parent {}
    applyFragments(Child as unknown as new (...a: never[]) => unknown);
    // Child must NOT have its own fragmentCacheKeys property — the
    // parent's list inherits via the prototype chain.
    expect(Object.prototype.hasOwnProperty.call(Child, "fragmentCacheKeys")).toBe(false);
    expect(Child.fragmentCacheKeys).toHaveLength(1);
  });

  it("fragmentCacheKey appends constants-as-thunks and blocks in order", () => {
    const cls: FragmentsClassMethods = { fragmentCacheKeys: [() => "a"] };
    fragmentCacheKey(cls, "b");
    fragmentCacheKey(cls, undefined, function (this: FragmentsHost) {
      return 42;
    });
    expect(cls.fragmentCacheKeys!.map((f) => f.call({} as FragmentsHost))).toEqual(["a", "b", 42]);
  });
});

describe("combinedFragmentCacheKey", () => {
  it("prepends :views, includes RAILS_CACHE_ID || RAILS_APP_VERSION, drops nulls", () => {
    expect(combinedFragmentCacheKey.call(makeHost(), "n")).toEqual(["views", "n"]);

    process.env.RAILS_APP_VERSION = "1.2.3";
    expect(combinedFragmentCacheKey.call(makeHost(), "n")).toEqual(["views", "1.2.3", "n"]);

    process.env.RAILS_CACHE_ID = "deploy-42";
    expect(combinedFragmentCacheKey.call(makeHost(), "n")).toEqual(["views", "deploy-42", "n"]);
  });

  it("falls through empty-string env vars (|| semantics, not ??)", () => {
    process.env.RAILS_CACHE_ID = "";
    process.env.RAILS_APP_VERSION = "1.2.3";
    expect(combinedFragmentCacheKey.call(makeHost(), "n")).toEqual(["views", "1.2.3", "n"]);

    process.env.RAILS_APP_VERSION = "";
    expect(combinedFragmentCacheKey.call(makeHost(), "n")).toEqual(["views", "n"]);
  });

  it("throws when a hash key is given without a host urlFor", () => {
    const host = makeHost();
    (host as { urlFor?: unknown }).urlFor = undefined;
    expect(() => combinedFragmentCacheKey.call(host, { a: 1 })).toThrow(/requires a host/);
  });

  it("throws when host urlFor returns a non-string", () => {
    const host = makeHost();
    host.urlFor = () => 123 as unknown as string;
    expect(() => combinedFragmentCacheKey.call(host, { a: 1 })).toThrow(/must return a string/);
  });

  it("evaluates prefix blocks in instance scope and flattens one level", () => {
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

  it("treats a plain-object key as urlFor and strips the scheme", () => {
    expect(
      combinedFragmentCacheKey.call(makeHost(), { controller: "pages", action: "notes", id: 45 }),
    ).toEqual(["views", "test.host/pages/notes/45"]);
  });
});

describe("read/write/expire fragment", () => {
  let host: HostClass & FragmentsHost;
  beforeEach(() => {
    host = makeHost(new MemoryStore());
  });

  it("round-trips content, reports existence, and expires by key", () => {
    expect(fragmentExist.call(host, "n")).toBe(false);
    expect(writeFragment.call(host, "n", "body")).toBe("body");
    expect(readFragment.call(host, "n")).toBe("body");
    expect(fragmentExist.call(host, "n")).toBe(true);
    expireFragment.call(host, "n");
    expect(readFragment.call(host, "n")).toBeNull();
  });

  it("RegExp expiry delegates to deleteMatched", () => {
    writeFragment.call(host, "pages/45/notes", "a");
    writeFragment.call(host, "pages/46/notes", "b");
    writeFragment.call(host, "other", "c");
    expireFragment.call(host, /pages\/\d+\/notes/);
    expect(readFragment.call(host, "pages/45/notes")).toBeNull();
    expect(readFragment.call(host, "other")).toBe("c");
  });

  it("returns content / undefined when caching is not configured", () => {
    HostClass.performCaching = false;
    expect(writeFragment.call(host, "n", "body")).toBe("body");
    expect(readFragment.call(host, "n")).toBeUndefined();
    expect(fragmentExist.call(host, "n")).toBeUndefined();
    expect(expireFragment.call(host, "n")).toBeUndefined();
  });
});

describe("instrumentFragmentCache", () => {
  it("fires under abstract_controller by default and honours host overrides", () => {
    const host = makeHost();
    const sub = vi.fn();
    const h1 = Notifications.subscribe("write_fragment.abstract_controller", sub);
    try {
      expect(instrumentFragmentCache(host, "write_fragment", "k", () => "ok")).toBe("ok");
      expect(sub.mock.calls[0][0]?.payload).toEqual({ key: "k" });
    } finally {
      Notifications.unsubscribe(h1);
    }

    host.instrumentName = () => "action_controller";
    host.instrumentPayload = (key) => ({ key, controller: "Pages" });
    const sub2 = vi.fn();
    const h2 = Notifications.subscribe("read_fragment.action_controller", sub2);
    try {
      instrumentFragmentCache(host, "read_fragment", "k", () => null);
      expect(sub2.mock.calls[0][0]?.payload).toEqual({ key: "k", controller: "Pages" });
    } finally {
      Notifications.unsubscribe(h2);
    }
  });
});
