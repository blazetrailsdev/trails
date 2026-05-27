import type { LookupContext } from "../lookup-context.js";
import { MissingTemplate } from "../lookup-context.js";
import {
  AbstractRenderer,
  RenderedTemplate,
  localVariable,
  partialPath,
} from "./abstract-renderer.js";
import type { RenderableTemplate, ViewContext, RenderOptions } from "./abstract-renderer.js";

function parsePartialPath(partial: string): { name: string; prefix: string } {
  const slash = partial.lastIndexOf("/");
  return slash >= 0
    ? { name: partial.slice(slash + 1), prefix: partial.slice(0, slash) }
    : { name: partial, prefix: "" };
}

function findPartialTemplate(lookupContext: LookupContext, partial: string): RenderableTemplate {
  const { name, prefix } = parsePartialPath(partial);
  const format = (lookupContext.formats[0] as string | undefined) ?? "html";
  const template = lookupContext.findPartial(name, prefix, format);
  if (!template) throw new MissingTemplate(prefix, `_${name}`, format, [], []);
  return template as unknown as RenderableTemplate;
}

/**
 * ActionView::PartialRenderer
 *
 * Renders a single named partial with optional locals and layout.
 * @internal
 */
export class PartialRenderer extends AbstractRenderer {
  protected readonly options: RenderOptions;

  constructor(lookupContext: LookupContext, options: RenderOptions = {}) {
    super(lookupContext);
    this.options = options;
  }

  async render(partial: string, context: ViewContext, _block: unknown): Promise<RenderedTemplate> {
    const locals = { ...(this.options.locals ?? {}) };
    const template = findPartialTemplate(this.lookupContext, partial);
    const body = await template.render(locals, context);
    return this.buildRenderedTemplate(body, template);
  }
}

/**
 * ActionView::ObjectRenderer
 *
 * Renders a partial inferred from `object.toPartialPath()` or with an
 * explicit partial name. Binds the object as a local variable.
 * @internal
 */
export class ObjectRenderer extends AbstractRenderer {
  protected readonly options: RenderOptions;

  constructor(lookupContext: LookupContext, options: RenderOptions = {}) {
    super(lookupContext);
    this.options = options;
  }

  async renderObjectWithPartial(
    object: unknown,
    partial: string,
    context: ViewContext,
    _block: unknown,
  ): Promise<RenderedTemplate> {
    const localName = localVariable(partial, this.options as Record<string, unknown>);
    const locals = { ...(this.options.locals ?? {}), [localName]: object };
    const template = findPartialTemplate(this.lookupContext, partial);
    const body = await template.render(locals, context);
    return this.buildRenderedTemplate(body, template);
  }

  async renderObjectDerivePartial(
    object: unknown,
    context: ViewContext,
    block: unknown,
  ): Promise<RenderedTemplate> {
    const contextPrefix = this.lookupContext.prefixes[0] ?? "";
    const path = partialPath(object, context, contextPrefix);
    return this.renderObjectWithPartial(object, path, context, block);
  }

  render(): RenderedTemplate {
    throw new Error("Use renderObjectWithPartial or renderObjectDerivePartial.");
  }
}

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
export class CollectionRenderer extends AbstractRenderer {
  protected readonly options: RenderOptions;

  constructor(lookupContext: LookupContext, options: RenderOptions = {}) {
    super(lookupContext);
    this.options = options;
  }

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

    const template = findPartialTemplate(this.lookupContext, partial);

    let spacerBody = "";
    if (this.options.spacerTemplate) {
      const { prefix } = parsePartialPath(partial);
      const spacerPath =
        this.options.spacerTemplate.includes("/") || !prefix
          ? this.options.spacerTemplate
          : `${prefix}/${this.options.spacerTemplate}`;
      const spacerTmpl = findPartialTemplate(this.lookupContext, spacerPath);
      spacerBody = await spacerTmpl.render({ ...baseLocals }, context);
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
      parts.push(await template.render(locals, context));
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
    const firstPath = paths[0]!;
    if (paths.every((p) => p === firstPath)) {
      return this.renderCollectionWithPartial(collection, firstPath, context, block);
    }
    // Heterogeneous collection — render each item with its own derived partial.
    const baseLocals = { ...(this.options.locals ?? {}) };
    const iteration = new PartialIteration(collection.length);
    const parts: string[] = [];
    let lastTemplate: RenderableTemplate | null = null;
    for (let i = 0; i < collection.length; i++) {
      const template = findPartialTemplate(this.lookupContext, paths[i]!);
      lastTemplate = template;
      const itemAs = localVariable(paths[i]!, this.options as Record<string, unknown>);
      const locals = {
        ...baseLocals,
        [itemAs]: collection[i],
        [`${itemAs}_counter`]: iteration.index,
        [`${itemAs}_iteration`]: iteration,
      };
      parts.push(await template.render(locals, context));
      iteration.iterate();
    }
    return this.buildRenderedTemplate(parts.join(""), lastTemplate);
  }

  render(): RenderedTemplate {
    throw new Error("Use renderCollectionWithPartial or renderCollectionDerivePartial.");
  }
}
