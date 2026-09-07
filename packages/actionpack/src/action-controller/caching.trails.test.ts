import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryStore, Notifications } from "@blazetrails/activesupport";

import { Base as ActionViewBase, type CacheHelperHost } from "@blazetrails/actionview";

import type { CachingHost } from "../abstract-controller/caching.js";

import { Base } from "./base.js";

describe("AbstractController::Caching included into ActionController::Base", () => {
  let events: string[];
  let subscriber: ReturnType<typeof Notifications.subscribe>;

  beforeEach(() => {
    events = [];
    subscriber = Notifications.subscribe(
      /fragment\.action_controller$/,
      (event: { name: string }) => {
        events.push(event.name);
      },
    );
  });

  afterEach(() => {
    Notifications.unsubscribe(subscriber);
  });

  it("ships the Rails defaults on the class and through the instance reader", () => {
    expect((Base as unknown as { performCaching: boolean }).performCaching).toBe(true);
    expect((Base as unknown as { defaultStaticExtension: string }).defaultStaticExtension).toBe(
      ".html",
    );
    expect(
      (Base as unknown as { enableFragmentCacheLogging: boolean }).enableFragmentCacheLogging,
    ).toBe(false);
    expect(
      (Base as unknown as { _viewCacheDependencies: unknown[] })._viewCacheDependencies,
    ).toEqual([]);
  });

  it("initializes fragment_cache_keys to the included-state default", () => {
    expect((Base as unknown as { fragmentCacheKeys: unknown[] }).fragmentCacheKeys).toEqual([]);
  });

  it("resolves an assigned cache store through Cache.lookup_store", () => {
    class LookupController extends Base {}
    const controller = new LookupController() as unknown as { cacheStore: unknown };
    controller.cacheStore = ":memory_store";
    expect(controller.cacheStore).toBeInstanceOf(MemoryStore);
    expect((LookupController as unknown as { cacheStore: unknown }).cacheStore).toBeUndefined();
  });

  it("resolves a cache store assigned on the class too, from extend ConfigMethods", () => {
    class ExtendedController extends Base {}
    const cls = ExtendedController as unknown as { cacheStore: unknown };
    cls.cacheStore = ":memory_store";
    expect(cls.cacheStore).toBeInstanceOf(MemoryStore);
    expect((new ExtendedController() as unknown as { cacheStore: unknown }).cacheStore).toBe(
      cls.cacheStore,
    );
  });

  it("instruments read_fragment / write_fragment when a template caches", async () => {
    class CachedController extends Base {}
    (CachedController as unknown as { cacheStore: unknown }).cacheStore = new MemoryStore();

    const controller = new CachedController();
    const view = new ActionViewBase(null, {}, controller) as ActionViewBase & CacheHelperHost;

    view.cache("fragment", {}, () => {
      view.outputBuffer.append("hello");
    });
    expect(view.outputBuffer.toStr()).toBe("hello");
    expect(events).toContain("read_fragment.action_controller");
    expect(events).toContain("write_fragment.action_controller");

    events.length = 0;
    const view2 = new ActionViewBase(null, {}, controller) as ActionViewBase & CacheHelperHost;
    view2.cache("fragment", {}, () => {
      view2.outputBuffer.append("miss");
    });
    expect(view2.outputBuffer.toStr()).toBe("hello");
    expect(events).toContain("read_fragment.action_controller");
    expect(events).not.toContain("write_fragment.action_controller");
  });

  it("view_cache_dependencies is registered as a helper method", () => {
    class DependentController extends Base {}
    (
      DependentController as unknown as { viewCacheDependency: (b: () => unknown) => void }
    ).viewCacheDependency(() => "v1");
    expect(
      (
        new DependentController() as unknown as CachingHost & { viewCacheDependencies(): unknown[] }
      ).viewCacheDependencies(),
    ).toEqual(["v1"]);
  });
});
