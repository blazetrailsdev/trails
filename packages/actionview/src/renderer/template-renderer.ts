import { Notifications, type SafeBuffer } from "@blazetrails/activesupport";

import { ArgumentError, File, hasKey, hashAref, rbObjRespondTo } from "@blazetrails/ruby-compat";

import type { LookupContext } from "../lookup-context.js";
import { MissingTemplate } from "../template/error.js";
import { RawFile } from "../template/raw-file.js";
import { Inline } from "../template/inline.js";
import { Text } from "../template/text.js";
import { HTML } from "../template/html.js";
import { Renderable } from "../template/renderable.js";
import { type TemplateHandler } from "../template/handlers.js";
import { Template } from "../template.js";
import { AbstractRenderer, RenderedTemplate } from "./abstract-renderer.js";
import type { RenderableTemplate, ViewContext, RenderOptions } from "./abstract-renderer.js";

/** @internal */
export class TemplateRenderer<Rendered = Promise<RenderedTemplate>> extends AbstractRenderer {
  /** @internal */
  protected details: Record<string, readonly (string | symbol)[]> = {};

  constructor(lookupContext: LookupContext) {
    super(lookupContext);
  }

  render(context: ViewContext, options: RenderOptions): Rendered {
    this.details = this.extractDetails(options as Record<string, unknown>);
    const template = this.determineTemplate(options);
    this.prependFormats(template.format);
    return this.renderTemplate(context, template, options.layout, options.locals ?? {});
  }

  /** @internal */
  private determineTemplate(
    options: RenderOptions & { isKey?(key: string): boolean },
  ): RenderableTemplate {
    const keys = options.locals ? Object.keys(options.locals) : [];

    if (hasKey(options, "body")) {
      return new Text(options.body);
    }
    if (hasKey(options, "plain")) {
      return new Text(options.plain);
    }
    if (hasKey(options, "html")) {
      return new HTML(options.html, this.formats[0]);
    }
    if (hasKey(options, "file")) {
      const file = hashAref(options, "file") as string;
      if (File.isExist(file)) {
        return new RawFile(file);
      } else {
        if (File.isAbsolutePath(file)) {
          throw new ArgumentError(`File ${file} does not exist`);
        } else {
          throw new ArgumentError(
            `\`render file:\` should be given the absolute path to a file. '${file}' was given instead`,
          );
        }
      }
    }
    if (hasKey(options, "inline")) {
      const handler = Template.handlerForExtension(options.type ?? "tse");
      const format = rbObjRespondTo(handler, "defaultFormat")
        ? (handler as TemplateHandler & { defaultFormat: string }).defaultFormat
        : ((this.lookupContext.formats[0] as string | undefined) ?? null);
      return new Inline(options.inline as string, "inline template", handler!, {
        locals: keys,
        format,
      });
    }
    if (hasKey(options, "renderable")) {
      return new Renderable(options.renderable);
    }
    if (hasKey(options, "template")) {
      if (rbObjRespondTo(options.template, "render")) {
        return options.template as RenderableTemplate;
      }
      return this.lookupContext.findTemplate(
        options.template as string,
        options.prefixes,
        false,
        keys,
        this.details,
      ) as RenderableTemplate;
    }
    throw new ArgumentError(
      "You invoked render but did not give any of :body, :file, :html, :inline, :partial, :plain, :renderable, or :template option.",
    );
  }

  /** @internal */
  protected renderTemplate(
    view: ViewContext,
    template: RenderableTemplate,
    layoutName: RenderOptions["layout"],
    locals: Record<string, unknown>,
  ): Rendered {
    return this.renderWithLayout(view, template, layoutName, locals, (layout) =>
      Notifications.instrument<Promise<string | SafeBuffer>>(
        "render_template.action_view",
        {
          identifier: template.identifier,
          layout: layout && layout.virtualPath,
          locals,
        },
        () =>
          template.render(view, locals, null, {}, (...name) =>
            view._layoutFor!(...name),
          ) as Promise<string | SafeBuffer>,
      ),
    ) as unknown as Rendered;
  }

  /** @internal */
  private async renderWithLayout(
    view: ViewContext,
    template: RenderableTemplate,
    path: RenderOptions["layout"],
    locals: Record<string, unknown>,
    block: (layout: RenderableTemplate | null) => Promise<string | SafeBuffer>,
  ): Promise<RenderedTemplate> {
    const layout =
      path != null && path !== false
        ? this.findLayout(path, Object.keys(locals), [this.formats[0] as string])
        : null;

    let body: string | SafeBuffer;
    if (layout) {
      body = await Notifications.instrument<Promise<string | SafeBuffer>>(
        "render_layout.action_view",
        { identifier: layout.identifier },
        async () => {
          view.viewFlow?.set("layout", await block(layout));
          return (await layout.render(view, locals, null, {}, (...name) =>
            view._layoutFor!(...name),
          )) as string | SafeBuffer;
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
          formats: this.lookupContext.defaultFormats(),
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
