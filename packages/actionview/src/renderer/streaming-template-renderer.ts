import type { LookupContext } from "../lookup-context.js";
import { AbstractRenderer, RenderedTemplate } from "./abstract-renderer.js";
import type { RenderableTemplate, ViewContext, RenderOptions } from "./abstract-renderer.js";

/**
 * ActionView::StreamingTemplateRenderer
 *
 * Rack-compatible streaming renderer. Mirrors Rails' Fiber-based approach:
 * the layout streams its prefix, yields to the inner template, then streams
 * its suffix. In TypeScript we achieve this by rendering the layout with a
 * sentinel placeholder substituted at `<%= yield %>`, splitting the result at
 * that placeholder, then yielding the three chunks in order.
 *
 * Rails source: actionview/lib/action_view/renderer/streaming_template_renderer.rb
 * @internal
 */
export class StreamingTemplateRenderer extends AbstractRenderer {
  render(..._args: unknown[]): never {
    throw new Error("Use renderStream() for streaming rendering.");
  }

  /**
   * Yields string chunks as they become available.
   *
   * Without a layout, the template body is yielded as a single chunk.
   * With a layout, the layout is split at its `yield` point so the prefix
   * is flushed before the (potentially slow) inner template renders.
   *
   * On error, logs and yields `ActionView::Base.streaming_completion_on_exception`
   * (an empty string in this port) so the response can still be closed cleanly.
   */
  async *renderStream(context: ViewContext, options: RenderOptions): AsyncGenerator<string> {
    const locals = options.locals ?? {};
    const keys = Object.keys(locals);

    const details = this.extractDetails(options as Record<string, unknown>);
    const found = this.lookupContext.findAll(
      options.template as string,
      (options.prefixes ?? []) as string[],
      false,
      keys,
      details,
    ) as RenderableTemplate[];

    const template =
      found.length > 0
        ? found[0]!
        : (this.lookupContext.findTemplate(
            options.template as string,
            (options.prefixes ?? [])[0] ?? "",
            (this.formats[0] as string) ?? "html",
          ) as unknown as RenderableTemplate | null);

    if (!template) {
      throw new Error(`Missing template: ${String(options.template)}`);
    }

    if (template.format) {
      this.prependFormats([template.format]);
    }

    const layoutName = options.layout;
    const layout =
      layoutName != null && layoutName !== false
        ? this.resolveLayout(layoutName, keys, [(this.formats[0] as string) ?? "html"])
        : null;

    try {
      if (!layout) {
        const body = await template.render(locals, context);
        yield body;
        return;
      }

      yield* this.delayedRender(context, template, layout, locals);
    } catch (err) {
      logError(err);
      yield streamingCompletionOnException;
    }
  }

  /**
   * Mirrors `delayed_render`: splits the layout at its yield point so the
   * prefix reaches the client before the inner template is rendered.
   * @internal
   */
  private async *delayedRender(
    context: ViewContext,
    template: RenderableTemplate,
    layout: RenderableTemplate,
    locals: Record<string, unknown>,
  ): AsyncGenerator<string> {
    // Render the layout with a unique sentinel in place of the template body.
    // This lets us split the layout output at the yield boundary.
    const sentinel = `\x00STREAM_YIELD_${Date.now()}_${Math.random()}\x00`;
    const streamingContext: ViewContext = {
      ...context,
      _layoutFor: (name?: string) => (name ? (context._layoutFor?.(name) ?? "") : sentinel),
    };

    const layoutBody = await layout.render(locals, streamingContext);
    const sentinelIdx = layoutBody.indexOf(sentinel);

    if (sentinelIdx === -1) {
      // Layout never yielded — render template normally and append.
      const templateBody = await template.render(locals, context);
      const fullBody = layoutBody + templateBody;
      yield fullBody;
      return;
    }

    const layoutPrefix = layoutBody.slice(0, sentinelIdx);
    const layoutSuffix = layoutBody.slice(sentinelIdx + sentinel.length);

    // Stream layout prefix immediately (e.g. <html><head>…</head><body>).
    yield layoutPrefix;

    // Render the template (this is where the "wait" happens in Rails' Fiber).
    const templateBody = await template.render(locals, context);
    yield templateBody;

    // Resume: stream layout suffix (e.g. </body></html>).
    yield layoutSuffix;
  }

  /** @internal */
  private resolveLayout(
    layout: RenderOptions["layout"],
    keys: string[],
    formats: string[],
  ): RenderableTemplate | null {
    if (typeof layout === "string") {
      const detailsWithFormats = { formats };
      const found = this.lookupContext.findAll(
        layout,
        [],
        false,
        keys,
        detailsWithFormats,
      ) as RenderableTemplate[];
      if (found.length > 0) return found[0]!;
      const format = formats[0] ?? "html";
      return this.lookupContext.findLayout(layout, format) as unknown as RenderableTemplate | null;
    }
    if (typeof layout === "function") {
      const resolved = layout(this.lookupContext, this.formats as readonly string[], keys);
      return resolved ? this.resolveLayout(resolved, keys, formats) : null;
    }
    return null;
  }
}

/** Mirrors `ActionView::Base.streaming_completion_on_exception`. @internal */
const streamingCompletionOnException = "";

/** Mirrors `Body#log_error`. @internal */
function logError(err: unknown): void {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  // Use console.error in the absence of ActionView::Base.logger.

  console.error(`\n${message}\n`);
}

/**
 * A Rack-compatible streaming body.
 *
 * Mirrors `ActionView::StreamingTemplateRenderer::Body`. Iterates over chunks
 * by consuming the async generator returned by `StreamingTemplateRenderer`.
 * @internal
 */
export class StreamingBody {
  constructor(
    private readonly lookupContext: LookupContext,
    private readonly context: ViewContext,
    private readonly options: RenderOptions,
  ) {}

  /**
   * Yields rendered chunks. Mirrors Rails' `Body#each`.
   */
  async *each(): AsyncGenerator<string> {
    const renderer = new StreamingTemplateRenderer(this.lookupContext);
    yield* renderer.renderStream(this.context, this.options);
  }

  /**
   * Collects all chunks into a single string. Convenience wrapper used by
   * `Renderer#renderBody` when the caller needs the full body at once.
   * @internal
   */
  async toArray(): Promise<string[]> {
    const chunks: string[] = [];
    for await (const chunk of this.each()) {
      chunks.push(chunk);
    }
    return chunks;
  }
}

/**
 * A `RenderedTemplate` variant that carries the streaming body.
 * @internal
 */
export class StreamingRenderedTemplate extends RenderedTemplate {
  constructor(
    readonly streamingBody: StreamingBody,
    template: import("./abstract-renderer.js").RenderableTemplate | null,
  ) {
    super("", template);
  }
}
