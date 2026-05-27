import type { LookupContext } from "../lookup-context.js";

/**
 * ActionView::AbstractRenderer
 *
 * Base class for all renderer objects. Each concrete subclass handles one
 * rendering mode (template, partial, collection, streaming). A new instance
 * is created per `render` call — no per-instance state is reused across
 * invocations.
 * @internal
 */
export abstract class AbstractRenderer {
  /** @internal */
  protected readonly lookupContext: LookupContext;

  constructor(lookupContext: LookupContext) {
    this.lookupContext = lookupContext;
  }

  // Subclasses override with appropriate signatures:
  // TemplateRenderer: render(context, options)
  // PartialRenderer:  render(partial, context, block)
  abstract render(...args: unknown[]): RenderedTemplate;
}

/**
 * The view context passed to every render call — the ActionView::Base-like
 * object that templates execute against. Phase 4 will flesh this out; for
 * now we type it as a structural interface covering what the renderer needs.
 */
export interface ViewContext {
  readonly lookupContext?: LookupContext;
}

/**
 * Raw render options hash — mirrors the kwargs accepted by Rails'
 * `ActionView::Renderer#render` / `ActionController::Base#render`.
 */
export interface RenderOptions {
  template?: string;
  partial?: string | object;
  inline?: string;
  body?: string;
  plain?: string;
  html?: string;
  layout?: string | false | null;
  locals?: Record<string, unknown>;
  collection?: readonly unknown[];
  as?: string;
  spacerTemplate?: string;
  object?: unknown;
  prefixes?: string[];
  type?: string;
  formats?: string[];
  variants?: string[];
  [key: string]: unknown;
}

/**
 * The result of a render call, carrying the rendered body string.
 * Mirrors Rails' `ActionView::AbstractRenderer::RenderedTemplate`.
 */
export class RenderedTemplate {
  constructor(readonly body: string) {}
}
