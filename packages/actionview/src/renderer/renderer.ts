import type { LookupContext } from "../lookup-context.js";
import type { ViewContext, RenderOptions } from "./abstract-renderer.js";
import { RenderedTemplate } from "./abstract-renderer.js";
import { TemplateRenderer } from "./template-renderer.js";
import { PartialRenderer, ObjectRenderer, CollectionRenderer } from "./partial-renderer.js";

export type { ViewContext, RenderOptions };
export { RenderedTemplate };

/**
 * ActionView::Renderer
 *
 * Top-level rendering orchestrator shared by ActionView and ActionController.
 * Parses render options and delegates to the appropriate sub-renderer:
 * `TemplateRenderer` (Phase 3b) or `PartialRenderer` / `CollectionRenderer` /
 * `ObjectRenderer` (Phase 3c).
 *
 * A new sub-renderer instance is created per render call. `cacheHits` is the
 * only instance-level mutable state and accumulates across calls.
 */
export class Renderer {
  lookupContext: LookupContext;

  constructor(lookupContext: LookupContext) {
    this.lookupContext = lookupContext;
  }

  /**
   * Main render entry point shared by ActionView and ActionController.
   * Returns a Promise resolving to the rendered body string.
   */
  async render(context: ViewContext, options: RenderOptions): Promise<string> {
    return (await this.renderToObject(context, options)).body;
  }

  /**
   * Like `render` but returns a `RenderedTemplate` object carrying the body.
   * @internal
   */
  async renderToObject(context: ViewContext, options: RenderOptions): Promise<RenderedTemplate> {
    if (Object.prototype.hasOwnProperty.call(options, "partial")) {
      return this.renderPartialToObject(context, options);
    }
    return this.renderTemplateToObject(context, options);
  }

  /**
   * Render and return a Rack-compatible body. For partials this is a single
   * string wrapped in an array; for templates this would be a streaming body
   * (Phase 3d). Currently both paths return an array.
   */
  async renderBody(context: ViewContext, options: RenderOptions): Promise<string[]> {
    if (Object.prototype.hasOwnProperty.call(options, "partial")) {
      return [await this.renderPartial(context, options)];
    }
    // Phase 3d: StreamingTemplateRenderer. For now delegate to template renderer.
    return [(await this.renderTemplateToObject(context, options)).body];
  }

  /**
   * Render a partial and return the body string.
   * @internal
   */
  async renderPartial(
    context: ViewContext,
    options: RenderOptions,
    block?: unknown,
  ): Promise<string> {
    return (await this.renderPartialToObject(context, options, block)).body;
  }

  /** Tracks partial cache hits across renders on this Renderer instance. */
  cacheHits: Record<string, number> = {};

  private renderTemplateToObject(
    context: ViewContext,
    options: RenderOptions,
  ): Promise<RenderedTemplate> {
    return new TemplateRenderer(this.lookupContext).render(context, options);
  }

  private renderPartialToObject(
    context: ViewContext,
    options: RenderOptions,
    block?: unknown,
  ): RenderedTemplate | Promise<RenderedTemplate> {
    const partial = options.partial;

    if (typeof partial === "string") {
      const collection = collectionFromOptions(options);

      if (collection !== undefined) {
        return new CollectionRenderer(this.lookupContext).renderCollectionWithPartial(
          collection,
          partial,
          context,
          block,
        );
      }

      if (Object.prototype.hasOwnProperty.call(options, "object")) {
        return new ObjectRenderer(this.lookupContext).renderObjectWithPartial(
          options.object,
          partial,
          context,
          block,
        );
      }

      return new PartialRenderer(this.lookupContext).render(partial, context, block);
    }

    // partial is an object — derive path from toPartialPath()
    const collection = collectionFromObject(partial) ?? collectionFromOptions(options);

    if (collection !== undefined) {
      return new CollectionRenderer(this.lookupContext).renderCollectionDerivePartial(
        collection,
        context,
        block,
      );
    }

    return new ObjectRenderer(this.lookupContext).renderObjectDerivePartial(
      partial,
      context,
      block,
    );
  }
}

/** @internal */
function collectionFromOptions(options: RenderOptions): readonly unknown[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(options, "collection")) return undefined;
  return (options.collection as readonly unknown[] | null | undefined) ?? [];
}

/** @internal */
function collectionFromObject(object: unknown): readonly unknown[] | undefined {
  if (
    object !== null &&
    object !== undefined &&
    typeof (object as { toAry?: unknown }).toAry === "function"
  ) {
    return (object as { toAry(): readonly unknown[] }).toAry();
  }
  return undefined;
}
