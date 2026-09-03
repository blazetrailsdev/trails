import type { LookupContext } from "../lookup-context.js";
import { MissingTemplate } from "../lookup-context.js";
import { AbstractRenderer, RenderedTemplate } from "./abstract-renderer.js";
import type { RenderableTemplate, ViewContext, RenderOptions } from "./abstract-renderer.js";

/** @internal */
export class PartialRenderer extends AbstractRenderer {
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

  async render(partial: string, context: ViewContext, block: unknown): Promise<RenderedTemplate> {
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
    _block: unknown,
  ): Promise<RenderedTemplate> {
    let content = await template.render(view, locals);
    if (layout) {
      view.viewFlow?.set("layout", content);
      content = await layout.render(view, locals);
    }
    return this.buildRenderedTemplate(content, template);
  }

  /** @internal */
  protected findTemplate(path: string, locals: readonly string[]): RenderableTemplate {
    const prefixes = path.includes("/") ? [] : this.lookupContext.prefixes;
    const template = this.lookupContext.findAll(
      path,
      prefixes,
      true,
      locals,
      this.details as Record<string, never>,
    )[0];
    if (!template) {
      const { name, prefix } = this.parsePartialPath(path);
      const format = (this.lookupContext.formats[0] as string | undefined) ?? "html";
      throw new MissingTemplate(prefix, `_${name}`, format, [], []);
    }
    return template as RenderableTemplate;
  }

  protected parsePartialPath(partial: string): { name: string; prefix: string } {
    const slash = partial.lastIndexOf("/");
    return slash >= 0
      ? { name: partial.slice(slash + 1), prefix: partial.slice(0, slash) }
      : { name: partial, prefix: "" };
  }
}
