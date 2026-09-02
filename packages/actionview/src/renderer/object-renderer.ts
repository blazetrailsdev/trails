import { localVariable, partialPath } from "./abstract-renderer.js";
import type {
  ObjectRenderingHost,
  RenderableTemplate,
  RenderedTemplate,
  ViewContext,
} from "./abstract-renderer.js";
import type { LookupContext } from "../lookup-context.js";
import type { RenderOptions } from "./abstract-renderer.js";
import { PartialRenderer } from "./partial-renderer.js";

/**
 * ActionView::ObjectRenderer
 *
 * Renders a partial inferred from `object.toPartialPath()` or with an
 * explicit partial name. Binds the object as a local variable.
 * @internal
 */
export class ObjectRenderer extends PartialRenderer implements ObjectRenderingHost {
  /** `include ObjectRendering` (`object_renderer.rb:5`). @internal */
  localVariable = localVariable;
  /** `include ObjectRendering` (`object_renderer.rb:5`). @internal */
  partialPath = partialPath;

  /** Mirrors `@context_prefix` (`abstract_renderer.rb:39`). @internal */
  contextPrefix: string;
  private object: unknown = null;
  private localName: string | null = null;

  constructor(lookupContext: LookupContext, options: RenderOptions = {}) {
    super(lookupContext, options);
    this.contextPrefix = lookupContext.prefixes[0] ?? "";
  }

  /** Mirrors `render_object_with_partial` (`object_renderer.rb:12-16`). */
  async renderObjectWithPartial(
    object: unknown,
    partial: string,
    context: ViewContext,
    block: unknown,
  ): Promise<RenderedTemplate> {
    this.object = object;
    this.localName = this.localVariable(partial);
    return this.render(partial, context, block);
  }

  /** Mirrors `render_object_derive_partial` (`object_renderer.rb:18-21`). */
  async renderObjectDerivePartial(
    object: unknown,
    context: ViewContext,
    block: unknown,
  ): Promise<RenderedTemplate> {
    const path = this.partialPath(object, context);
    return this.renderObjectWithPartial(object, path, context, block);
  }

  /** Mirrors `template_keys(path)` (`object_renderer.rb:24-26`). @internal */
  protected override templateKeys(path: string): string[] {
    return [...super.templateKeys(path), ...(this.localName != null ? [this.localName] : [])];
  }

  /** Mirrors `render_partial_template` (`object_renderer.rb:28-31`). @internal */
  protected override async renderPartialTemplate(
    view: ViewContext,
    locals: Record<string, unknown>,
    template: RenderableTemplate,
    layout: RenderableTemplate | null,
    block: unknown,
  ): Promise<RenderedTemplate> {
    locals[this.localName ?? template.variable!] = this.object;
    return super.renderPartialTemplate(view, locals, template, layout, block);
  }
}
