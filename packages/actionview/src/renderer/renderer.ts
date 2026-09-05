import type { LookupContext } from "../lookup-context.js";
import type { ViewContext, RenderOptions } from "./abstract-renderer.js";
import { RenderedTemplate } from "./abstract-renderer.js";
import { TemplateRenderer } from "./template-renderer.js";
import { PartialRenderer } from "./partial-renderer.js";
import { ObjectRenderer } from "./object-renderer.js";
import { CollectionRenderer } from "./collection-renderer.js";
import { StreamingBody } from "./streaming-template-renderer.js";

export type { ViewContext, RenderOptions };
export { RenderedTemplate };

export class Renderer {
  lookupContext: LookupContext;

  constructor(lookupContext: LookupContext) {
    this.lookupContext = lookupContext;
  }

  async render(context: ViewContext, options: RenderOptions): Promise<string> {
    return (await this.renderToObject(context, options)).body;
  }

  /** @internal */
  async renderToObject(context: ViewContext, options: RenderOptions): Promise<RenderedTemplate> {
    if (Object.prototype.hasOwnProperty.call(options, "partial")) {
      return this.renderPartialToObject(context, options);
    }
    return this.renderTemplateToObject(context, options);
  }

  async renderBody(context: ViewContext, options: RenderOptions): Promise<string[]> {
    if (Object.prototype.hasOwnProperty.call(options, "partial")) {
      return [await this.renderPartial(context, options)];
    }
    if (options.stream) {
      return new StreamingBody(this.lookupContext, context, options).toArray();
    }
    return [(await this.renderTemplateToObject(context, options)).body];
  }

  /** @internal */
  async renderPartial(
    context: ViewContext,
    options: RenderOptions,
    block?: unknown,
  ): Promise<string> {
    return (await this.renderPartialToObject(context, options, block)).body;
  }

  cacheHits: Record<string, unknown> = {};

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
        return new CollectionRenderer(this.lookupContext, options).renderCollectionWithPartial(
          collection,
          partial,
          context,
          block,
        );
      }

      if (Object.prototype.hasOwnProperty.call(options, "object")) {
        return new ObjectRenderer(this.lookupContext, options).renderObjectWithPartial(
          options.object,
          partial,
          context,
          block,
        );
      }

      return new PartialRenderer(this.lookupContext, options).render(partial, context, block);
    }

    const collection = collectionFromObject(partial) ?? collectionFromOptions(options);

    if (collection !== undefined) {
      return new CollectionRenderer(this.lookupContext, options).renderCollectionDerivePartial(
        collection,
        context,
        block,
      );
    }

    return new ObjectRenderer(this.lookupContext, options).renderObjectDerivePartial(
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
