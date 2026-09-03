import type { LookupContext } from "../lookup-context.js";
import { AbstractRenderer, RenderedTemplate } from "./abstract-renderer.js";
import type { RenderableTemplate, ViewContext, RenderOptions } from "./abstract-renderer.js";

/** @internal */
export class StreamingTemplateRenderer extends AbstractRenderer {
  render(..._args: unknown[]): never {
    throw new Error("Use renderStream() for streaming rendering.");
  }

  async *renderStream(context: ViewContext, options: RenderOptions): AsyncGenerator<string> {
    const locals = options.locals ?? {};
    const keys = Object.keys(locals);

    const details = this.extractDetails(options as Record<string, unknown>);
    const found = this.lookupContext.findAll(
      options.template as string,
      options.prefixes ?? [],
      false,
      keys,
      details,
    ) as RenderableTemplate[];

    const template =
      found.length > 0
        ? found[0]
        : (this.lookupContext.findTemplate(
            options.template as string,
            options.prefixes ?? [],
            this.formats,
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
        const body = await template.render(context, locals);
        yield body;
        return;
      }

      yield* this.delayedRender(context, template, layout, locals);
    } catch (err) {
      logError(err);
      yield streamingCompletionOnException;
    }
  }

  /** @internal */
  private async *delayedRender(
    context: ViewContext,
    template: RenderableTemplate,
    layout: RenderableTemplate,
    locals: Record<string, unknown>,
  ): AsyncGenerator<string> {
    const sentinel = `\x00STREAM_YIELD_${Date.now()}_${Math.random()}\x00`;
    const streamingContext: ViewContext = {
      ...context,
      _layoutFor: (name?: string) => (name ? (context._layoutFor?.(name) ?? "") : sentinel),
    };

    const layoutBody = await layout.render(streamingContext, locals);
    const sentinelIdx = layoutBody.indexOf(sentinel);

    if (sentinelIdx === -1) {
      const templateBody = await template.render(context, locals);
      const fullBody = layoutBody + templateBody;
      yield fullBody;
      return;
    }

    const layoutPrefix = layoutBody.slice(0, sentinelIdx);
    const layoutSuffix = layoutBody.slice(sentinelIdx + sentinel.length);

    yield layoutPrefix;

    const templateBody = await template.render(context, locals);
    yield templateBody;

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
      if (found.length > 0) return found[0];
      return this.lookupContext.findLayout(
        layout,
        ["layouts"],
        formats,
      ) as unknown as RenderableTemplate | null;
    }
    if (typeof layout === "function") {
      const resolved = layout(this.lookupContext, this.formats as readonly string[], keys);
      return resolved ? this.resolveLayout(resolved, keys, formats) : null;
    }
    return null;
  }
}

/** @internal */
const streamingCompletionOnException = "";

/** @internal */
function logError(exception: unknown): void {
  const message =
    exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception);

  console.error(`\n${message}\n`);
}

/** @internal */
export class StreamingBody {
  constructor(
    private readonly lookupContext: LookupContext,
    private readonly context: ViewContext,
    private readonly options: RenderOptions,
  ) {}

  async *each(): AsyncGenerator<string> {
    const renderer = new StreamingTemplateRenderer(this.lookupContext);
    yield* renderer.renderStream(this.context, this.options);
  }

  /** @internal */
  async toArray(): Promise<string[]> {
    const chunks: string[] = [];
    for await (const chunk of this.each()) {
      chunks.push(chunk);
    }
    return chunks;
  }
}

/** @internal */
export class StreamingRenderedTemplate extends RenderedTemplate {
  constructor(
    readonly streamingBody: StreamingBody,
    template: import("./abstract-renderer.js").RenderableTemplate | null,
  ) {
    super("", template);
  }
}
