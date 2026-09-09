import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryStore, Notifications } from "@blazetrails/activesupport";

import { LookupContext } from "../../lookup-context.js";
import { CollectionRenderer } from "../collection-renderer.js";
import { PartialRenderer } from "../partial-renderer.js";
import type { RenderableTemplate, ViewContext } from "../abstract-renderer.js";
import { collectionCache, setCollectionCache } from "./collection-caching.js";

class RecordingStore extends MemoryStore {
  readMultiCalls = 0;
  writeMultiCalls = 0;

  override readMulti(...names: string[]): Record<string, unknown> {
    this.readMultiCalls += 1;
    return super.readMulti(...names);
  }

  override writeMulti(hash: Record<string, unknown>): Record<string, unknown> {
    this.writeMultiCalls += 1;
    return super.writeMulti(hash);
  }
}

function buildView(digest = "abc"): ViewContext {
  return {
    controller: { performCaching: true },
    digestPathFromTemplate: (t: RenderableTemplate) => `${t.virtualPath}:${digest}`,
    cacheFragmentName: (name: unknown, { digestPath }: { digestPath?: string | null }) => [
      digestPath,
      name,
    ],
    combinedFragmentCacheKey: (key: unknown) => [":views", key],
  } as unknown as ViewContext;
}

function buildTemplate(bodies: string[]): RenderableTemplate {
  const render = vi.fn();
  for (const body of bodies) render.mockResolvedValueOnce(body);
  return {
    identifier: "customers/_customer.html.tse",
    format: "html",
    virtualPath: "customers/_customer",
    render,
  };
}

describe("CollectionCaching", () => {
  let store: RecordingStore;
  let lc: LookupContext;

  beforeEach(() => {
    store = new RecordingStore();
    setCollectionCache(store);
    lc = new LookupContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is mixed into PartialRenderer at Rails' site", () => {
    expect(PartialRenderer.collectionCache).toBe(collectionCache);
    expect(PartialRenderer.setCollectionCache).toBe(setCollectionCache);
  });

  it("reads the whole collection in one multi-read and writes the misses in one multi-write", async () => {
    vi.spyOn(lc, "findAll").mockReturnValue([buildTemplate(["<david>", "<mary>"])] as never);

    const rendered = await new CollectionRenderer(lc, {
      cached: true,
    }).renderCollectionWithPartial(["david", "mary"], "customers/customer", buildView(), undefined);

    expect(store.readMultiCalls).toBe(1);
    expect(store.writeMultiCalls).toBe(1);
    expect(rendered.body).toBe("<david><mary>");
  });

  it("serves a second render from the cache without re-rendering the partial", async () => {
    const render = () => {
      const template = buildTemplate(["<david>", "<mary>"]);
      vi.spyOn(lc, "findAll").mockReturnValue([template] as never);
      return {
        template,
        result: new CollectionRenderer(lc, { cached: true }).renderCollectionWithPartial(
          ["david", "mary"],
          "customers/customer",
          buildView(),
          undefined,
        ),
      };
    };

    await render().result;
    const second = render();
    const rendered = await second.result;

    expect(second.template.render).not.toHaveBeenCalled();
    expect(rendered.body).toBe("<david><mary>");
  });

  it("keys on the template digest, so a changed partial misses the cache", async () => {
    const first = buildTemplate(["<old>"]);
    vi.spyOn(lc, "findAll").mockReturnValue([first] as never);
    await new CollectionRenderer(lc, { cached: true }).renderCollectionWithPartial(
      ["david"],
      "customers/customer",
      buildView("abc"),
      undefined,
    );

    const second = buildTemplate(["<new>"]);
    vi.spyOn(lc, "findAll").mockReturnValue([second] as never);
    const rendered = await new CollectionRenderer(lc, { cached: true }).renderCollectionWithPartial(
      ["david"],
      "customers/customer",
      buildView("def"),
      undefined,
    );

    expect(second.render).toHaveBeenCalledTimes(1);
    expect(rendered.body).toBe("<new>");
  });

  it("renders without touching the cache when the controller is not caching", async () => {
    vi.spyOn(lc, "findAll").mockReturnValue([buildTemplate(["<david>"])] as never);
    const view = buildView() as unknown as { controller: { performCaching: boolean } };
    view.controller.performCaching = false;

    const rendered = await new CollectionRenderer(lc, { cached: true }).renderCollectionWithPartial(
      ["david"],
      "customers/customer",
      view as unknown as ViewContext,
      undefined,
    );

    expect(store.readMultiCalls).toBe(0);
    expect(rendered.body).toBe("<david>");
  });

  it("instruments render_collection.action_view with Rails' payload", async () => {
    const events: Record<string, unknown>[] = [];
    const subscription = Notifications.subscribe("render_collection.action_view", (event) => {
      events.push(event.payload);
    });

    try {
      vi.spyOn(lc, "findAll").mockReturnValue([buildTemplate(["<david>", "<mary>"])] as never);
      await new CollectionRenderer(lc, { cached: true }).renderCollectionWithPartial(
        ["david", "mary"],
        "customers/customer",
        buildView(),
        undefined,
      );
    } finally {
      Notifications.unsubscribe(subscription);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      identifier: "customers/_customer.html.tse",
      layout: null,
      count: 2,
      cache_hits: 0,
    });
  });
});
