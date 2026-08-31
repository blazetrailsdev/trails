import { RenderedTemplate, localVariable, partialPath } from "./abstract-renderer.js";
import type { RenderableTemplate, ViewContext } from "./abstract-renderer.js";
import { PartialRenderer } from "./partial-renderer.js";

/**
 * ActionView::PartialIteration
 *
 * Iteration metadata exposed as `${as}_iteration` inside collection partials.
 * @internal
 */
export class PartialIteration {
  index = 0;

  constructor(readonly size: number) {}

  get first(): boolean {
    return this.index === 0;
  }

  get last(): boolean {
    return this.index === this.size - 1;
  }

  /** @internal */
  iterate(): void {
    this.index++;
  }
}

/**
 * ActionView::CollectionRenderer
 *
 * Renders a partial once per element in a collection. Exposes
 * `${as}_counter` and `${as}_iteration` locals per Rails contract.
 * @internal
 */
export class CollectionRenderer extends PartialRenderer {
  async renderCollectionWithPartial(
    collection: readonly unknown[],
    partial: string,
    context: ViewContext,
    _block: unknown,
  ): Promise<RenderedTemplate> {
    if (collection.length === 0) {
      return new RenderedTemplate("", null);
    }

    const as = localVariable(partial, this.options as Record<string, unknown>);
    const counterKey = `${as}_counter`;
    const iterationKey = `${as}_iteration`;
    const baseLocals = { ...(this.options.locals ?? {}) };

    const template = this.findTemplate(partial);

    let spacerBody = "";
    if (this.options.spacerTemplate) {
      const { prefix } = this.parsePartialPath(partial);
      const spacerPath =
        this.options.spacerTemplate.includes("/") || !prefix
          ? this.options.spacerTemplate
          : `${prefix}/${this.options.spacerTemplate}`;
      const spacerTmpl = this.findTemplate(spacerPath);
      spacerBody = await spacerTmpl.render(context, { ...baseLocals });
    }

    const iteration = new PartialIteration(collection.length);
    const parts: string[] = [];

    for (const item of collection) {
      const locals = {
        ...baseLocals,
        [as]: item,
        [counterKey]: iteration.index,
        [iterationKey]: iteration,
      };
      parts.push(await template.render(context, locals));
      iteration.iterate();
    }

    const body = parts.join(spacerBody);
    return this.buildRenderedTemplate(body, template);
  }

  async renderCollectionDerivePartial(
    collection: readonly unknown[],
    context: ViewContext,
    block: unknown,
  ): Promise<RenderedTemplate> {
    if (collection.length === 0) {
      return new RenderedTemplate("", null);
    }
    const contextPrefix = this.lookupContext.prefixes[0] ?? "";
    const paths = collection.map((item) => partialPath(item, context, contextPrefix));
    const firstPath = paths[0];
    if (paths.every((p) => p === firstPath)) {
      return this.renderCollectionWithPartial(collection, firstPath, context, block);
    }
    // Heterogeneous collection — render each item with its own derived partial.
    const baseLocals = { ...(this.options.locals ?? {}) };
    const iteration = new PartialIteration(collection.length);
    const parts: string[] = [];
    let lastTemplate: RenderableTemplate | null = null;
    for (let i = 0; i < collection.length; i++) {
      const template = this.findTemplate(paths[i]);
      lastTemplate = template;
      const itemAs = localVariable(paths[i], this.options as Record<string, unknown>);
      const locals = {
        ...baseLocals,
        [itemAs]: collection[i],
        [`${itemAs}_counter`]: iteration.index,
        [`${itemAs}_iteration`]: iteration,
      };
      parts.push(await template.render(context, locals));
      iteration.iterate();
    }
    return this.buildRenderedTemplate(parts.join(""), lastTemplate);
  }
}
