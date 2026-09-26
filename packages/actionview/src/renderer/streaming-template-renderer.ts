import { Notifications } from "@blazetrails/activesupport";
import { ActionView } from "../namespaces.js";
import { TemplateRenderer } from "./template-renderer.js";
import type {
  RenderableTemplate,
  RenderedTemplate,
  RenderOptions,
  ViewContext,
} from "./abstract-renderer.js";

type Buffer = (chunk: string) => void;

/** @internal */
export class Body {
  /** @internal */
  private readonly start: (buffer: Buffer) => Promise<void>;

  constructor(start: (buffer: Buffer) => Promise<void>) {
    this.start = start;
  }

  async each(block: Buffer): Promise<this> {
    try {
      await this.start(block);
    } catch (exception) {
      this.logError(exception);
      block(ActionView.Base.streamingCompletionOnException);
    }
    return this;
  }

  /** @internal */
  private logError(exception: unknown): void {
    const logger = ActionView.Base.logger as { fatal(message: string): unknown } | null;
    if (!logger) return;

    const error = exception instanceof Error ? exception : new Error(String(exception));
    let message = `\n${error.name} (${error.message}):\n`;
    const annotated = (error as { annotatedSourceCode?: () => unknown }).annotatedSourceCode;
    if (typeof annotated === "function") message += String(annotated.call(error) ?? "");
    message += "  " + (error.stack ?? "").split("\n").slice(1).join("\n  ");
    logger.fatal(`${message}\n\n`);
  }
}

/** @internal */
export class StreamingTemplateRenderer extends TemplateRenderer<Body | (string | null)[]> {
  /** @internal */
  protected override async renderTemplate(
    view: ViewContext,
    template: RenderableTemplate,
    layoutName: RenderOptions["layout"] = null,
    locals: Record<string, unknown> = {},
  ): Promise<Body | (string | null)[]> {
    if (!(layoutName != null && layoutName !== false && template.supportsStreaming?.())) {
      const rendered = await super.renderTemplate(view, template, layoutName, locals);
      return [(rendered as unknown as RenderedTemplate).body];
    }

    locals ??= {};
    const layout = this.findLayout(layoutName, Object.keys(locals), [
      (this.formats[0] as string) ?? ":html",
    ]);

    return new Body((buffer) => this.delayedRender(buffer, template, layout, view, locals));
  }

  /**
   * @internal
   * @missingRailsCall instrument — PERMANENT
   */
  private async delayedRender(
    buffer: Buffer,
    template: RenderableTemplate,
    layout: RenderableTemplate | null,
    view: ViewContext,
    locals: Record<string, unknown>,
  ): Promise<void> {
    const sentinel = `\x00STREAM_YIELD_${Date.now()}_${Math.random()}\x00`;
    const streamingContext: ViewContext = {
      ...view,
      _layoutFor: (name?: string) => (name ? (view._layoutFor?.(name) ?? "") : sentinel),
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
        buffer(await template.render(view, locals));
        return;
      }

      const layoutBody = await layout.render(streamingContext, locals);
      const sentinelIdx = layoutBody.indexOf(sentinel);

      if (sentinelIdx === -1) {
        buffer(layoutBody + (await template.render(view, locals)));
        return;
      }

      buffer(layoutBody.slice(0, sentinelIdx));
      buffer(await template.render(view, locals));
      buffer(layoutBody.slice(sentinelIdx + sentinel.length));
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
