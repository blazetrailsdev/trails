import { Notifications } from "@blazetrails/activesupport";

import type { LookupContext } from "../lookup-context.js";
import { AbstractRenderer, RenderedTemplate } from "./abstract-renderer.js";
import {
  cacheCollectionRender,
  collectionByCacheKeys,
  collectionCache,
  expandedCacheKey,
  fetchOrCachePartial,
  isCallableCacheKey,
  isWillCache,
  setCollectionCache,
} from "./partial-renderer/collection-caching.js";
import type { RenderableTemplate, ViewContext, RenderOptions } from "./abstract-renderer.js";

/** @internal */
export class PartialRenderer extends AbstractRenderer {
  /** @internal */
  static collectionCache = collectionCache;
  /** @internal */
  static setCollectionCache = setCollectionCache;

  /** @internal */
  collectionCache = collectionCache;
  /** @internal */
  isWillCache = isWillCache;
  /** @internal */
  cacheCollectionRender = cacheCollectionRender;
  /** @internal */
  isCallableCacheKey = isCallableCacheKey;
  /** @internal */
  collectionByCacheKeys = collectionByCacheKeys;
  /** @internal */
  expandedCacheKey = expandedCacheKey;
  /** @internal */
  fetchOrCachePartial = fetchOrCachePartial;

  /** @internal */
  readonly options: RenderOptions;
  /** @internal */
  protected readonly locals: Record<string, unknown>;

  /** @internal */
  protected readonly details: Record<string, readonly (string | symbol)[]>;

  constructor(lookupContext: LookupContext, options: RenderOptions = {}) {
    super(lookupContext);
    this.options = options;
    this.locals = options.locals ?? {};
    this.details = this.extractDetails(options as Record<string, unknown>);
  }

  async render(
    partial: string,
    context: ViewContext,
    block: ((...args: unknown[]) => unknown) | null | undefined,
  ): Promise<RenderedTemplate> {
    const template = this.findTemplate(partial, this.templateKeys(partial));

    let layout: RenderableTemplate | null = null;
    const optionsLayout = this.options.layout;
    if (block == null && optionsLayout != null && optionsLayout !== false) {
      layout = this.findTemplate(String(optionsLayout), this.templateKeys(partial));
    }

    return this.renderPartialTemplate(context, this.locals, template, layout, block);
  }

  /** @internal */
  protected templateKeys(_: string): string[] {
    return Object.keys(this.locals);
  }

  /** @internal */
  protected async renderPartialTemplate(
    view: ViewContext,
    locals: Record<string, unknown>,
    template: RenderableTemplate,
    layout: RenderableTemplate | null,
    block: ((...args: unknown[]) => unknown) | null | undefined,
  ): Promise<RenderedTemplate> {
    return Notifications.instrument<Promise<RenderedTemplate>>(
      "render_partial.action_view",
      {
        identifier: template.identifier,
        layout: layout && layout.virtualPath,
        locals,
      },
      async (payload) => {
        let content = await template.render(
          view,
          locals,
          null,
          { addToStack: block == null },
          (...name) => view._layoutFor!(...name, block),
        );

        if (layout) content = await layout.render(view, locals, null, {}, () => content);
        payload["cache_hit"] = view.viewRenderer.cacheHits[template.virtualPath as string];
        return this.buildRenderedTemplate(content, template);
      },
    );
  }

  /** @internal */
  protected findTemplate(path: string, locals: readonly string[]): RenderableTemplate {
    const prefixes = path.includes("/") ? [] : this.lookupContext.prefixes;
    return this.lookupContext.find(
      path,
      prefixes,
      true,
      locals,
      this.details as Record<string, never>,
    ) as RenderableTemplate;
  }
}
