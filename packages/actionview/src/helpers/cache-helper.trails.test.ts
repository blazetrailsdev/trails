import { describe, it, expect } from "vitest";

import { OutputBuffer } from "../buffers.js";
import {
  cache,
  cacheIf,
  cacheUnless,
  isCaching,
  uncacheableBang,
  UncacheableFragmentError,
  type CacheHelperHost,
} from "./cache-helper.js";
import { cacheFragmentName, digestPathFromTemplate } from "./cache-helper.js";

function makeView(performCaching = true): CacheHelperHost & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  const view = {
    store,
    currentTemplate: null,
    lookupContext: null,
    outputBuffer: new OutputBuffer(),
    cacheFragmentName,
    digestPathFromTemplate,
    viewCacheDependencies: () => [],
    safeConcat(string: unknown) {
      return view.outputBuffer.safeAppend(string);
    },
    controller: {
      performCaching,
      urlFor: (options: unknown) => `http://test.host/${String((options as { id?: unknown }).id)}`,
      readFragment: (key: unknown) => store.get(String(key)),
      writeFragment: (key: unknown, content: unknown) => {
        store.set(String(key), content);
        return content;
      },
      viewCacheDependencies: () => [],
    },
  } as unknown as CacheHelperHost & { store: Map<string, unknown> };
  return view;
}

describe("CacheHelper", () => {
  it("writes the fragment on a miss and reads it back on a hit", () => {
    const view = makeView();
    let calls = 0;
    cache.call(view, "foo", {}, () => {
      calls += 1;
      view.outputBuffer.append("bar");
    });
    expect(String(view.store.get("foo"))).toBe("bar");
    expect(view.outputBuffer.toStr()).toBe("bar");

    cache.call(view, "foo", {}, () => {
      calls += 1;
      view.outputBuffer.append("baz");
    });
    expect(calls).toBe(1);
    expect(view.outputBuffer.toStr()).toBe("barbar");
  });

  it("yields without caching when the controller does not perform caching", () => {
    const view = makeView(false);
    cache.call(view, "foo", {}, () => view.outputBuffer.append("bar"));
    expect(view.store.size).toBe(0);
    expect(view.outputBuffer.toStr()).toBe("bar");
  });

  it("caching? is true only inside a cache block", () => {
    const view = makeView();
    expect(isCaching.call(view)).toBe(false);
    let inside: boolean | null = null;
    cache.call(view, "foo", {}, () => {
      inside = isCaching.call(view);
    });
    expect(inside).toBe(true);
    expect(isCaching.call(view)).toBe(false);
  });

  it("uncacheable! raises inside a cache block", () => {
    const view = makeView();
    expect(() => uncacheableBang.call(view)).not.toThrow();
    expect(() =>
      cache.call(view, "foo", {}, () => {
        uncacheableBang.call(view);
      }),
    ).toThrow(UncacheableFragmentError);
  });

  it("cache_if caches only when the condition is true", () => {
    const view = makeView();
    cacheIf.call(view, false, "foo", {}, () => view.outputBuffer.append("bar"));
    expect(view.store.size).toBe(0);
    cacheIf.call(view, true, "foo", {}, () => view.outputBuffer.append("bar"));
    expect(view.store.size).toBe(1);
  });

  it("cache_unless caches only when the condition is false", () => {
    const view = makeView();
    cacheUnless.call(view, true, "foo", {}, () => view.outputBuffer.append("bar"));
    expect(view.store.size).toBe(0);
    cacheUnless.call(view, false, "foo", {}, () => view.outputBuffer.append("bar"));
    expect(view.store.size).toBe(1);
  });

  it("cache_fragment_name returns the bare name when skip_digest is passed", () => {
    const view = makeView();
    expect(cacheFragmentName.call(view, "foo", { skipDigest: true })).toBe("foo");
  });
});
