import { MemoryStore, SafeBuffer, indexWith } from "@blazetrails/activesupport";
import type { CacheStore } from "@blazetrails/activesupport";
import { Hash, rbObjRespondTo } from "@blazetrails/ruby-compat";

import { OutputBuffer } from "../../buffers.js";
import type { SameCollectionIterator } from "../collection-renderer.js";
import type { RenderableTemplate, RenderedTemplate, RenderOptions } from "../abstract-renderer.js";

/** @internal */
export interface CollectionCachingView {
  controller: { performCaching?: boolean };
  digestPathFromTemplate(template: RenderableTemplate): string;
  cacheFragmentName(name: unknown, options: { digestPath?: string | null }): unknown;
  combinedFragmentCacheKey(key: unknown): unknown[];
}

/** @internal */
export interface CollectionCachingHost {
  readonly options: RenderOptions;
  buildRenderedTemplate(content: string, template: RenderableTemplate | null): RenderedTemplate;
}

/** @internal */
let _collectionCache: CacheStore = new MemoryStore();

/** @internal */
export function collectionCache(): CacheStore {
  return _collectionCache;
}

/** @internal */
export function setCollectionCache(store: CacheStore): void {
  _collectionCache = store;
}

/** @internal */
export function isWillCache(
  this: CollectionCachingHost,
  options: RenderOptions,
  view: CollectionCachingView,
): boolean {
  return (
    options.cached != null &&
    options.cached !== false &&
    rbObjRespondTo(view.controller, "performCaching") &&
    view.controller.performCaching != null &&
    view.controller.performCaching !== false
  );
}

/** @internal */
export async function cacheCollectionRender(
  this: CollectionCachingHost,
  instrumentationPayload: Record<string, unknown>,
  view: CollectionCachingView,
  template: RenderableTemplate,
  collection: SameCollectionIterator,
  block: (collection: SameCollectionIterator) => Promise<RenderedTemplate[]>,
): Promise<RenderedTemplate[]> {
  if (!isWillCache.call(this, this.options, view)) return block(collection);

  const collectionIterator = collection;

  const [keyedCollection, orderedKeys] = await collectionByCacheKeys.call(
    this,
    view,
    template,
    collection,
  );

  const cachedPartials = collectionCache().readMulti(...keyedCollection.keys());
  instrumentationPayload["cache_hits"] = cachedPartials.size;

  const filtered = [...keyedCollection]
    .filter(([key]) => !cachedPartials.has(key))
    .map(([, item]) => item);

  const renderedPartials =
    filtered.length === 0 ? [] : await block(collectionIterator.fromCollection(filtered));

  let index = 0;
  const keyedPartials = fetchOrCachePartial.call(
    this,
    cachedPartials,
    template,
    { orderBy: [...keyedCollection.keys()] },
    () => renderedPartials[index++],
  );

  return orderedKeys.map((key) => keyedPartials.get(key) as RenderedTemplate);
}

/** @internal */
export function isCallableCacheKey(this: CollectionCachingHost): boolean {
  return typeof this.options.cached === "function";
}

/** @internal */
export async function collectionByCacheKeys(
  this: CollectionCachingHost,
  view: CollectionCachingView,
  template: RenderableTemplate,
  collection: SameCollectionIterator,
): Promise<[Map<unknown[], unknown>, unknown[][]]> {
  const seed = isCallableCacheKey.call(this)
    ? (this.options.cached as (i: unknown) => unknown)
    : (i: unknown) => i;

  const digestPath = view.digestPathFromTemplate(template);
  if (isCallableCacheKey.call(this)) await collection.preloadBang();

  const hash = new Hash<unknown[], unknown>();
  const orderedKeys: unknown[][] = [];
  await collection.each((item) => {
    const key = expandedCacheKey.call(this, seed(item), view, template, digestPath);
    orderedKeys.push(key);
    hash.set(key, item);
  });
  return [hash, orderedKeys];
}

/** @internal */
export function expandedCacheKey(
  this: CollectionCachingHost,
  key: unknown,
  view: CollectionCachingView,
  template: RenderableTemplate,
  digestPath: string,
): unknown[] {
  key = view.combinedFragmentCacheKey(view.cacheFragmentName(key, { digestPath }));
  return Object.isFrozen(key) ? [...(key as unknown[])] : (key as unknown[]);
}

/** @internal */
export function fetchOrCachePartial(
  this: CollectionCachingHost,
  cachedPartials: Map<unknown, unknown>,
  template: RenderableTemplate,
  { orderBy }: { orderBy: unknown[][] },
  block: () => RenderedTemplate,
): Map<unknown[], RenderedTemplate> {
  const entriesToWrite = new Hash<unknown[], unknown>();

  const keyedPartials = indexWith(orderBy, (cacheKey): RenderedTemplate => {
    const content = cachedPartials.get(cacheKey);
    if (content != null && content !== false) {
      return this.buildRenderedTemplate(content as string, template);
    } else {
      const renderedPartial = block();
      let body: unknown = renderedPartial.body;

      if (body instanceof OutputBuffer || body instanceof SafeBuffer) {
        body = (body as { toStr(): string }).toStr();
      }

      entriesToWrite.set(cacheKey, body);
      return renderedPartial;
    }
  });

  if (entriesToWrite.size !== 0) {
    collectionCache().writeMulti(entriesToWrite);
  }

  return keyedPartials;
}
