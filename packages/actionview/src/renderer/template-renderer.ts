import { Notifications } from "@blazetrails/activesupport";

import { ArgumentError, File, rbObjRespondTo } from "@blazetrails/ruby-compat";

import type { LookupContext } from "../lookup-context.js";
import { MissingTemplate } from "../template/error.js";
import { RawFile } from "../template/raw-file.js";
import { Inline } from "../template/inline.js";
import { Text } from "../template/text.js";
import { HTML } from "../template/html.js";
import { Renderable } from "../template/renderable.js";
import { TemplateHandlers, type TemplateHandler } from "../template/handlers.js";
import { AbstractRenderer, RenderedTemplate } from "./abstract-renderer.js";
import type { RenderableTemplate, ViewContext, RenderOptions } from "./abstract-renderer.js";

/** @internal */
export class TemplateRenderer<Rendered = RenderedTemplate> extends AbstractRenderer {
  /** @internal */
  protected details: Record<string, readonly (string | symbol)[]> = {};

  constructor(lookupContext: LookupContext) {
    super(lookupContext);
  }

  async render(context: ViewContext, options: RenderOptions): Promise<Rendered> {
    this.details = this.extractDetails(options as Record<string, unknown>);
    const template = this.determineTemplate(options);
    this.prependFormats(template.format ? [template.format] : null);
    return this.renderTemplate(context, template, options.layout, options.locals ?? {});
  }

  /** @internal */
  private determineTemplate(options: RenderOptions): RenderableTemplate {
    const keys = options.locals ? Object.keys(options.locals) : [];

    if (Object.prototype.hasOwnProperty.call(options, "body")) {
      return new Text(options.body);
    }
    if (Object.prototype.hasOwnProperty.call(options, "plain")) {
      return new Text(options.plain);
    }
    if (Object.prototype.hasOwnProperty.call(options, "html")) {
      return new HTML(options.html, this.formats[0]) as unknown as RenderableTemplate;
    }
    if (Object.prototype.hasOwnProperty.call(options, "file")) {
      if (File.isExist(options.file as string)) {
        return new RawFile(options.file);
      } else {
        if (File.isAbsolutePath(options.file as string)) {
          throw new ArgumentError(`File ${options.file} does not exist`);
        } else {
          throw new ArgumentError(
            `\`render file:\` should be given the absolute path to a file. '${options.file}' was given instead`,
          );
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(options, "inline")) {
      const handler = TemplateHandlers.handlerForExtension(options.type ?? "tse");
      const format = rbObjRespondTo(handler, "defaultFormat")
        ? (handler as TemplateHandler & { defaultFormat: string }).defaultFormat
        : ((this.lookupContext.formats[0] as string | undefined) ?? null);
      return new Inline({
        source: options.inline as string,
        identifier: "inline template",
        handler,
        locals: keys,
        format,
      }) as unknown as RenderableTemplate;
    }
    if (Object.prototype.hasOwnProperty.call(options, "renderable") && options.renderable) {
      return new Renderable(options.renderable) as unknown as RenderableTemplate;
    }
    if (Object.prototype.hasOwnProperty.call(options, "template") && options.template != null) {
      const tmpl = options.template;
      if (typeof tmpl === "object" && typeof tmpl.render === "function") {
        return tmpl;
      }
      return this.lookupContext.findTemplate(
        tmpl as string,
        options.prefixes,
        false,
        keys,
        this.details,
      ) as RenderableTemplate;
    }
    throw new Error(
      "You invoked render but did not give any of :body, :file, :html, :inline, :partial, :plain, :renderable, or :template option.",
    );
  }

  /** @internal */
  protected async renderTemplate(
    view: ViewContext,
    template: RenderableTemplate,
    layoutName: RenderOptions["layout"],
    locals: Record<string, unknown>,
  ): Promise<Rendered> {
    return (await this.renderWithLayout(view, template, layoutName, locals, (layout) =>
      Notifications.instrument<Promise<string>>(
        "render_template.action_view",
        {
          identifier: template.identifier,
          layout: layout && layout.virtualPath,
          locals,
        },
        async () => template.render(view, locals, null, {}, (...name) => view._layoutFor!(...name)),
      ),
    )) as unknown as Rendered;
  }

  /** @internal */
  private async renderWithLayout(
    view: ViewContext,
    template: RenderableTemplate,
    path: RenderOptions["layout"],
    locals: Record<string, unknown>,
    block: (layout: RenderableTemplate | null) => Promise<string>,
  ): Promise<RenderedTemplate> {
    const layout =
      path != null && path !== false
        ? this.findLayout(path, Object.keys(locals), [(this.formats[0] as string) ?? ":html"])
        : null;

    let body: string;
    if (layout) {
      body = await Notifications.instrument<Promise<string>>(
        "render_layout.action_view",
        { identifier: layout.identifier },
        async () => {
          view.viewFlow?.set("layout", await block(layout));
          return layout.render(view, locals, null, {}, (...name) => view._layoutFor!(...name));
        },
      );
    } else {
      body = await block(null);
    }
    return this.buildRenderedTemplate(body, template);
  }

  /** @internal */
  protected findLayout(
    layout: RenderOptions["layout"],
    keys: string[],
    formats: string[],
  ): RenderableTemplate | null {
    return this.resolveLayout(layout, keys, formats);
  }

  /** @internal */
  private resolveLayout(
    layout: RenderOptions["layout"],
    keys: string[],
    formats: string[],
  ): RenderableTemplate | null {
    const details = { ...this.details, formats };

    if (typeof layout === "string") {
      try {
        if (layout.startsWith("/")) {
          throw new ArgumentError("Rendering layouts from an absolute path is not supported.");
        } else {
          return this.lookupContext.findTemplate(
            layout,
            [],
            false,
            keys,
            details,
          ) as RenderableTemplate;
        }
      } catch (e) {
        if (!(e instanceof MissingTemplate)) throw e;
        const allDetails = {
          ...this.details,
          formats: this.lookupContext.defaultFormats() as readonly string[],
        };
        if (!this.templateExists(layout, [], false, keys, allDetails)) throw e;
        return null;
      }
    }
    if (typeof layout === "function") {
      return this.resolveLayout(layout(this.lookupContext, formats, keys), keys, formats);
    }
    return layout || null;
  }
}
