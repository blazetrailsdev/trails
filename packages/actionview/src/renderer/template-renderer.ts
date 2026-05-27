import type { LookupContext } from "../lookup-context.js";
import { AbstractRenderer, RenderedTemplate } from "./abstract-renderer.js";
import type { ViewContext, RenderOptions } from "./abstract-renderer.js";

/**
 * ActionView::TemplateRenderer
 *
 * Resolves and renders a single template (non-partial). Handles the
 * `template:`, `inline:`, `body:`, `plain:`, `html:`, and action-name
 * render paths.
 *
 * Phase 3b implements full template resolution and layout wrapping.
 * @internal
 */
export class TemplateRenderer extends AbstractRenderer {
  constructor(lookupContext: LookupContext) {
    super(lookupContext);
  }

  render(_context: ViewContext, _options: RenderOptions): RenderedTemplate;
  render(..._args: unknown[]): RenderedTemplate {
    // Phase 3b: resolve template via LookupContext, apply layout, render with handler.
    throw new Error(
      "TemplateRenderer is not yet implemented — pending Phase 3b. " +
        "Provide a `partial:` option to use PartialRenderer instead.",
    );
  }
}
