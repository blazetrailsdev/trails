import { Notifications } from "@blazetrails/activesupport";
import type { LookupContext } from "../lookup-context.js";
import { RenderedTemplate } from "./abstract-renderer.js";
import type { RenderableTemplate, ViewContext, RenderOptions } from "./abstract-renderer.js";
import { TemplateRenderer } from "./template-renderer.js";
import type { Template } from "../template.js";

type StreamableTemplate = RenderableTemplate & Pick<Template, "supportsStreaming">;

/** @internal */
export class StreamingTemplateRenderer extends TemplateRenderer {
  override render(..._args: unknown[]): never {
    throw new Error("Use renderStream() for streaming rendering.");
  }

  async *renderStream(context: ViewContext, options: RenderOptions): AsyncGenerator<string> {
    const locals = options.locals ?? {};
    const keys = Object.keys(locals);

    this.details = this.extractDetails(options as Record<string, unknown>);
    const found = this.lookupContext.findAll(
      options.template as string,
      options.prefixes ?? [],
      false,
      keys,
      this.details,
    ) as unknown as StreamableTemplate[];

    const template =
      found.length > 0
        ? found[0]
        : (this.lookupContext.findTemplate(
            options.template as string,
            options.prefixes ?? [],
            this.formats,
          ) as unknown as StreamableTemplate | null);

    if (!template) {
      throw new Error(`Missing template: ${String(options.template)}`);
    }

    if (template.format) {
      this.prependFormats([template.format]);
    }

    const layoutName = options.layout;

    if (!(layoutName != null && layoutName !== false && template.supportsStreaming())) {
      yield (await super.renderTemplate(context, template, layoutName, locals)).body;
      return;
    }

    const layout = this.findLayout(layoutName, keys, [(this.formats[0] as string) ?? ":html"]);

    try {
      yield* this.delayedRender(context, template, layout, locals);
    } catch (err) {
      logError(err);
      yield streamingCompletionOnException;
    }
  }

  /**
   * @internal
   * @missingRailsCall instrument — PERMANENT
   */
  private async *delayedRender(
    context: ViewContext,
    template: RenderableTemplate,
    layout: RenderableTemplate | null,
    locals: Record<string, unknown>,
  ): AsyncGenerator<string> {
    const sentinel = `\x00STREAM_YIELD_${Date.now()}_${Math.random()}\x00`;
    const streamingContext: ViewContext = {
      ...context,
      _layoutFor: (name?: string) => (name ? (context._layoutFor?.(name) ?? "") : sentinel),
    };

    const payload: Record<string, unknown> = {
      identifier: template.identifier,
      layout: layout && layout.virtualPath,
      locals,
    };
    const handle = Notifications.buildHandle("render_template.action_view", payload);
    handle.start();

    try {
      if (!layout) {
        const templateBody = await template.render(context, locals);
        yield templateBody;
        return;
      }

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
    } catch (e) {
      payload.exception = [
        e instanceof Error ? e.name : String(e),
        e instanceof Error ? e.message : String(e),
      ];
      payload.exception_object = e;
      throw e;
    } finally {
      handle.finish();
    }
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
