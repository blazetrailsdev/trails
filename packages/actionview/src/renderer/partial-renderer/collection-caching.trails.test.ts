import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "@blazetrails/activesupport";

import { RenderedTemplate } from "../abstract-renderer.js";
import type { RenderOptions } from "../abstract-renderer.js";
import { PartialRenderer } from "../partial-renderer.js";
import type { Template } from "../../template.js";
import {
  cacheCollectionRender,
  collectionCache,
  setCollectionCache,
} from "./collection-caching.js";
import type { CollectionCachingHost, CollectionIterator } from "./collection-caching.js";

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

class ArrayIterator implements CollectionIterator {
  constructor(private readonly collection: unknown[]) {}
  [Symbol.iterator](): Iterator<unknown> {
    return this.collection[Symbol.iterator]();
  }
  preloadBang(): void {}
  fromCollection(collection: unknown[]): CollectionIterator {
    return new ArrayIterator(collection);
  }
}

const template = { virtualPath: "customers/_customer", format: "html" } as unknown as Template;

function buildView(digest: string) {
  return {
    controller: { performCaching: true },
    digestPathFromTemplate: (t: Template) => `${t.virtualPath}:${digest}`,
    cacheFragmentName: (name: unknown, { digestPath }: { digestPath?: string | null }) => [
      digestPath,
      name,
    ],
    combinedFragmentCacheKey: (key: unknown) => [":views", key],
  };
}

function buildHost(options: RenderOptions): CollectionCachingHost {
  return {
    options,
    buildRenderedTemplate: (content, tmpl) =>
      new RenderedTemplate(content, tmpl as unknown as null),
  };
}

describe("CollectionCaching", () => {
  let store: RecordingStore;

  beforeEach(() => {
    store = new RecordingStore();
    setCollectionCache(store);
  });

  it("is mixed into PartialRenderer at Rails' site", () => {
    expect(PartialRenderer.collectionCache).toBe(collectionCache);
    expect(PartialRenderer.setCollectionCache).toBe(setCollectionCache);
  });

  it("reads the whole collection in one multi-read and writes the misses in one multi-write", async () => {
    const host = buildHost({ cached: true });
    const collection = new ArrayIterator(["david", "mary"]);
    const payload: Record<string, unknown> = {};

    const rendered = await cacheCollectionRender.call(
      host,
      payload,
      buildView("abc"),
      template,
      collection,
      async (filtered) => [...filtered].map((o) => new RenderedTemplate(`<${o}>`, null)),
    );

    expect(store.readMultiCalls).toBe(1);
    expect(store.writeMultiCalls).toBe(1);
    expect(payload["cache_hits"]).toBe(0);
    expect(rendered.map((r) => r.body)).toEqual(["<david>", "<mary>"]);
  });

  it("serves a second render from the cache, in the collection's order", async () => {
    const host = buildHost({ cached: true });
    const payload: Record<string, unknown> = {};
    const render = (payloadOut: Record<string, unknown>) =>
      cacheCollectionRender.call(
        host,
        payloadOut,
        buildView("abc"),
        template,
        new ArrayIterator(["david", "mary"]),
        async (filtered) => [...filtered].map((o) => new RenderedTemplate(`<${o}>`, null)),
      );

    await render({});
    const rendered = await render(payload);

    expect(payload["cache_hits"]).toBe(2);
    expect(store.writeMultiCalls).toBe(1);
    expect(rendered.map((r) => r.body)).toEqual(["<david>", "<mary>"]);
  });

  it("keys on the template digest, so a changed partial misses the cache", async () => {
    const host = buildHost({ cached: true });

    const first = await cacheCollectionRender.call(
      host,
      {},
      buildView("abc"),
      template,
      new ArrayIterator(["david"]),
      async () => [new RenderedTemplate("<old>", null)],
    );
    const payload: Record<string, unknown> = {};
    const second = await cacheCollectionRender.call(
      host,
      payload,
      buildView("def"),
      template,
      new ArrayIterator(["david"]),
      async () => [new RenderedTemplate("<new>", null)],
    );

    expect(first.map((r) => r.body)).toEqual(["<old>"]);
    expect(payload["cache_hits"]).toBe(0);
    expect(second.map((r) => r.body)).toEqual(["<new>"]);
  });

  it("renders without touching the cache when the controller is not caching", async () => {
    const host = buildHost({ cached: true });
    const view = buildView("abc");
    view.controller.performCaching = false;

    const rendered = await cacheCollectionRender.call(
      host,
      {},
      view,
      template,
      new ArrayIterator(["david"]),
      async () => [new RenderedTemplate("<david>", null)],
    );

    expect(store.readMultiCalls).toBe(0);
    expect(rendered.map((r) => r.body)).toEqual(["<david>"]);
  });
});
