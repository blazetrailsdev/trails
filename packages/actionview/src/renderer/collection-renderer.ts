import { RenderedTemplate, localVariable, partialPath } from "./abstract-renderer.js";
import type {
  ObjectRenderingHost,
  RenderableTemplate,
  RenderOptions,
  ViewContext,
} from "./abstract-renderer.js";
import type { LookupContext } from "../lookup-context.js";
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
export class CollectionRenderer extends PartialRenderer implements ObjectRenderingHost {
  /** `include ObjectRendering` (`collection_renderer.rb:34`). @internal */
  localVariable = localVariable;
  /** `include ObjectRendering` (`collection_renderer.rb:34`). @internal */
  partialPath = partialPath;

  /** Mirrors `@context_prefix` (`abstract_renderer.rb:39`). @internal */
  contextPrefix: string;

  constructor(lookupContext: LookupContext, options: RenderOptions = {}) {
    super(lookupContext, options);
    this.contextPrefix = lookupContext.prefixes[0] ?? "";
  }

  async renderCollectionWithPartial(
    collection: readonly unknown[],
    partial: string,
    context: ViewContext,
    block: unknown,
  ): Promise<RenderedTemplate> {
    if (collection.length === 0) {
      return new RenderedTemplate("", null);
    }

    const iterVars = this.retrieveVariable(partial);
    const [as, counterKey, iterationKey] = iterVars;
    const baseLocals = { ...this.locals };

    const template = this.findTemplate(partial, [...this.templateKeys(partial), ...iterVars]);

    let layout: RenderableTemplate | null = null;
    const optionsLayout = this.options.layout;
    if (block == null && optionsLayout != null && optionsLayout !== false) {
      layout = this.findTemplate(String(optionsLayout), [
        ...this.templateKeys(partial),
        ...iterVars,
      ]);
    }

    let spacerBody = "";
    if (this.options.spacerTemplate) {
      const { prefix } = this.parsePartialPath(partial);
      const spacerPath =
        this.options.spacerTemplate.includes("/") || !prefix
          ? this.options.spacerTemplate
          : `${prefix}/${this.options.spacerTemplate}`;
      const spacerTmpl = this.findTemplate(spacerPath, this.templateKeys(spacerPath));
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
      let content = await template.render(context, locals);
      if (layout) {
        context.viewFlow?.set("layout", content);
        content = await layout.render(context, locals);
      }
      parts.push(content);
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
    const paths = collection.map((item) => this.partialPath(item, context));
    const firstPath = paths[0];
    if (paths.every((p) => p === firstPath)) {
      return this.renderCollectionWithPartial(collection, firstPath, context, block);
    }
    // Heterogeneous collection — render each item with its own derived partial.
    const baseLocals = { ...this.locals };
    const iteration = new PartialIteration(collection.length);
    const parts: string[] = [];
    let lastTemplate: RenderableTemplate | null = null;
    for (let i = 0; i < collection.length; i++) {
      const template = this.findTemplate(paths[i], this.templateKeys(paths[i]));
      lastTemplate = template;
      const [itemAs, counterKey, iterationKey] = this.retrieveVariable(paths[i]);
      const locals = {
        ...baseLocals,
        [itemAs]: collection[i],
        [counterKey]: iteration.index,
        [iterationKey]: iteration,
      };
      parts.push(await template.render(context, locals));
      iteration.iterate();
    }
    return this.buildRenderedTemplate(parts.join(""), lastTemplate);
  }

  /** Mirrors `retrieve_variable` (`collection_renderer.rb:146-149`). @internal */
  protected retrieveVariable(path: string): [string, string, string] {
    const variable = this.localVariable(path);
    return [variable, `${variable}_counter`, `${variable}_iteration`];
  }
}
