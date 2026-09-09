import { MemoryStore, SafeBuffer, indexWith } from "@blazetrails/activesupport";
import type { CacheStore } from "@blazetrails/activesupport";
import { expandCacheKey } from "@blazetrails/activesupport/cache";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";

import { OutputBuffer } from "../../buffers.js";
import type { Template } from "../../template.js";
import type { RenderedTemplate, RenderOptions } from "../abstract-renderer.js";

/** @internal */
export interface CollectionIterator {
  [Symbol.iterator](): Iterator<unknown>;
  preloadBang(): void;
  fromCollection(collection: unknown[]): CollectionIterator;
}

/** @internal */
export interface CollectionCachingView {
  controller: { performCaching?: boolean };
  digestPathFromTemplate(template: Template): string;
  cacheFragmentName(name: unknown, options: { digestPath?: string | null }): unknown;
  combinedFragmentCacheKey(key: unknown): unknown[];
}

/** @internal */
export interface CollectionCachingHost {
  readonly options: RenderOptions;
  buildRenderedTemplate(content: string, template: Template | null): RenderedTemplate;
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
  template: Template,
  collection: CollectionIterator,
  block: (collection: CollectionIterator) => Promise<RenderedTemplate[]>,
): Promise<RenderedTemplate[]> {
  if (!isWillCache.call(this, this.options, view)) return block(collection);

  const collectionIterator = collection;

  const [keyedCollection, orderedKeys] = collectionByCacheKeys.call(
    this,
    view,
    template,
    collection,
  );

  const cachedPartials = collectionCache().readMulti(...keyedCollection.keys());
  instrumentationPayload["cache_hits"] = Object.keys(cachedPartials).length;

  const filtered = [...keyedCollection]
    .filter(([key]) => !Object.hasOwn(cachedPartials, key))
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
export function collectionByCacheKeys(
  this: CollectionCachingHost,
  view: CollectionCachingView,
  template: Template,
  collection: CollectionIterator,
): [Map<string, unknown>, string[]] {
  const seed = isCallableCacheKey.call(this)
    ? (this.options.cached as (i: unknown) => unknown)
    : (i: unknown) => i;

  const digestPath = view.digestPathFromTemplate(template);
  if (isCallableCacheKey.call(this)) collection.preloadBang();

  const hash = new Map<string, unknown>();
  const orderedKeys: string[] = [];
  for (const item of collection) {
    const key = expandedCacheKey.call(this, seed(item), view, template, digestPath);
    orderedKeys.push(key);
    hash.set(key, item);
  }
  return [hash, orderedKeys];
}

/** @internal */
export function expandedCacheKey(
  this: CollectionCachingHost,
  key: unknown,
  view: CollectionCachingView,
  template: Template,
  digestPath: string,
): string {
  return expandCacheKey(view.combinedFragmentCacheKey(view.cacheFragmentName(key, { digestPath })));
}

/** @internal */
export function fetchOrCachePartial(
  this: CollectionCachingHost,
  cachedPartials: Record<string, unknown>,
  template: Template,
  { orderBy }: { orderBy: string[] },
  block: () => RenderedTemplate,
): Map<string, RenderedTemplate> {
  const entriesToWrite: Record<string, unknown> = {};

  const keyedPartials = indexWith(orderBy, (cacheKey): RenderedTemplate => {
    const content = cachedPartials[cacheKey];
    if (content != null && content !== false) {
      return this.buildRenderedTemplate(content as string, template);
    } else {
      const renderedPartial = block();
      let body: unknown = renderedPartial.body;

      if (body instanceof OutputBuffer || body instanceof SafeBuffer) {
        body = (body as { toStr(): string }).toStr();
      }

      entriesToWrite[cacheKey] = body;
      return renderedPartial;
    }
  });

  if (Object.keys(entriesToWrite).length !== 0) {
    collectionCache().writeMulti(entriesToWrite);
  }

  return keyedPartials;
}
