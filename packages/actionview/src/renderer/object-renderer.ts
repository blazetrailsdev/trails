import { localVariable, partialPath } from "./abstract-renderer.js";
import type { RenderedTemplate, ViewContext } from "./abstract-renderer.js";
import { PartialRenderer } from "./partial-renderer.js";

/**
 * ActionView::ObjectRenderer
 *
 * Renders a partial inferred from `object.toPartialPath()` or with an
 * explicit partial name. Binds the object as a local variable.
 * @internal
 */
export class ObjectRenderer extends PartialRenderer {
  /**
   * @missingRailsArgs local_variable — CONVERGEABLE actionview-partial-renderer-bodies-pass-rails-arguments
   * @missingRailsArgs render — CONVERGEABLE actionview-partial-renderer-bodies-pass-rails-arguments
   */
  async renderObjectWithPartial(
    object: unknown,
    partial: string,
    context: ViewContext,
    _block: unknown,
  ): Promise<RenderedTemplate> {
    const localName = localVariable(partial, this.options as Record<string, unknown>);
    const locals = { ...(this.options.locals ?? {}), [localName]: object };
    const template = this.findTemplate(partial);
    const body = await template.render(locals, context);
    return this.buildRenderedTemplate(body, template);
  }

  /**
   * @missingRailsArgs partial_path — CONVERGEABLE actionview-partial-renderer-bodies-pass-rails-arguments
   */
  async renderObjectDerivePartial(
    object: unknown,
    context: ViewContext,
    block: unknown,
  ): Promise<RenderedTemplate> {
    const contextPrefix = this.lookupContext.prefixes[0] ?? "";
    const path = partialPath(object, context, contextPrefix);
    return this.renderObjectWithPartial(object, path, context, block);
  }
}
