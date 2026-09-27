import type { LookupContext } from "../lookup-context.js";
import type { ViewContext, RenderOptions } from "./abstract-renderer.js";
import { EmptyCollection, RenderedCollection, RenderedTemplate } from "./abstract-renderer.js";
import { TemplateRenderer } from "./template-renderer.js";
import { PartialRenderer } from "./partial-renderer.js";
import { ObjectRenderer } from "./object-renderer.js";
import { CollectionRenderer } from "./collection-renderer.js";
import { type Body, StreamingTemplateRenderer } from "./streaming-template-renderer.js";

export type { ViewContext, RenderOptions };
export { RenderedTemplate };

export class Renderer {
  lookupContext: LookupContext;

  constructor(lookupContext: LookupContext) {
    this.lookupContext = lookupContext;
  }

  render(context: ViewContext, options: RenderOptions): string | null | Promise<string | null> {
    const rendered = this.renderToObject(context, options);
    return isThenable(rendered) ? rendered.then((r) => r.body) : rendered.body;
  }

  /** @internal */
  renderToObject(
    context: ViewContext,
    options: RenderOptions,
  ):
    | RenderedTemplate
    | RenderedCollection
    | EmptyCollection
    | Promise<RenderedTemplate | RenderedCollection | EmptyCollection> {
    if (Object.prototype.hasOwnProperty.call(options, "partial")) {
      return this.renderPartialToObject(context, options);
    }
    return this.renderTemplateToObject(context, options);
  }

  async renderBody(
    context: ViewContext,
    options: RenderOptions,
  ): Promise<Body | (string | null)[]> {
    if (Object.prototype.hasOwnProperty.call(options, "partial")) {
      return [await this.renderPartial(context, options)];
    }
    return new StreamingTemplateRenderer(this.lookupContext).render(context, options);
  }

  /** @internal */
  renderPartial(
    context: ViewContext,
    options: RenderOptions,
    block?: (...args: unknown[]) => unknown,
  ): string | null | Promise<string | null> {
    const rendered = this.renderPartialToObject(context, options, block);
    return isThenable(rendered) ? rendered.then((r) => r.body) : rendered.body;
  }

  cacheHits: Record<string, unknown> = {};

  private renderTemplateToObject(context: ViewContext, options: RenderOptions): RenderedTemplate {
    return new TemplateRenderer(this.lookupContext).render(context, options);
  }

  private renderPartialToObject(
    context: ViewContext,
    options: RenderOptions,
    block?: (...args: unknown[]) => unknown,
  ):
    | RenderedTemplate
    | RenderedCollection
    | EmptyCollection
    | Promise<RenderedTemplate | RenderedCollection | EmptyCollection> {
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

function isThenable<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T> | null)?.then === "function";
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
