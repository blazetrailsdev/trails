import type { LookupContext } from "../lookup-context.js";
import { MissingTemplate } from "../lookup-context.js";
import { AbstractRenderer, RenderedTemplate } from "./abstract-renderer.js";
import type { RenderableTemplate, ViewContext, RenderOptions } from "./abstract-renderer.js";

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

  /**
   * @missingRailsArgs find_template — CONVERGEABLE actionview-partial-renderer-bodies-pass-rails-arguments
   */
  async render(partial: string, context: ViewContext, _block: unknown): Promise<RenderedTemplate> {
    const locals = { ...(this.options.locals ?? {}) };
    const template = this.findTemplate(partial);
    const body = await template.render(context, locals);
    return this.buildRenderedTemplate(body, template);
  }

  /** `partial_renderer.rb:262` — `find_template(path, locals)`. */
  protected findTemplate(path: string): RenderableTemplate {
    const { name, prefix } = this.parsePartialPath(path);
    const format = (this.lookupContext.formats[0] as string | undefined) ?? "html";
    const template = this.lookupContext.findPartial(name, prefix, format);
    if (!template) throw new MissingTemplate(prefix, `_${name}`, format, [], []);
    return template as unknown as RenderableTemplate;
  }

  protected parsePartialPath(partial: string): { name: string; prefix: string } {
    const slash = partial.lastIndexOf("/");
    return slash >= 0
      ? { name: partial.slice(slash + 1), prefix: partial.slice(0, slash) }
      : { name: partial, prefix: "" };
  }
}
