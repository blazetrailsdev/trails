import { I18n, Notifications, type SafeBuffer } from "@blazetrails/activesupport";
import { Fiber } from "@blazetrails/ruby-compat";
import { StreamingBuffer } from "../buffers.js";
import { StreamingFlow } from "../flows.js";
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
export class StreamingTemplateRenderer extends TemplateRenderer<
  Promise<Body | (string | SafeBuffer | null)[]>
> {
  /** @internal */
  protected override async renderTemplate(
    view: ViewContext,
    template: RenderableTemplate,
    layoutName: RenderOptions["layout"] = null,
    locals: Record<string, unknown> = {},
  ): Promise<Body | (string | SafeBuffer | null)[]> {
    if (!(layoutName != null && layoutName !== false && template.supportsStreaming?.())) {
      const rendered = super.renderTemplate(view, template, layoutName, locals);
      return [(rendered as unknown as RenderedTemplate).body];
    }

    locals ??= {};
    const layout = this.findLayout(layoutName, Object.keys(locals), [this.formats[0] as string]);

    return new Body((buffer) => this.delayedRender(buffer, template, layout, view, locals));
  }

  /** @internal */
  private async delayedRender(
    buffer: Buffer,
    template: RenderableTemplate,
    layout: RenderableTemplate | null,
    view: ViewContext,
    locals: Record<string, unknown>,
  ): Promise<void> {
    const output = new StreamingBuffer(buffer);
    const yielder = (...name: unknown[]) => view._layoutFor!(...name);

    await Notifications.instrument(
      "render_template.action_view",
      {
        identifier: template.identifier,
        layout: layout && layout.virtualPath,
        locals,
      },
      async () => {
        const outerConfig = I18n.config();
        const fiber = new Fiber(async () => {
          I18n.setConfig(outerConfig);
          if (layout) {
            await layout.render(view, locals, output, {}, yielder);
          } else {
            output.safeConcat(await view._layoutFor!());
          }
        });

        view.viewFlow = new StreamingFlow(
          view as unknown as ConstructorParameters<typeof StreamingFlow>[0],
          fiber,
        );

        await fiber.resume();

        if (fiber.isAlive()) {
          const content = await template.render(view, locals, null, {}, yielder);

          view.viewFlow.set("layout", content);

          while (fiber.isAlive()) await fiber.resume();
        }
      },
    );
  }
}
