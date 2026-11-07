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
    const keys = hasKey(options, "locals")
      ? Object.keys(hashAref(options, "locals") as object)
      : [];

    if (hasKey(options, "body")) {
      return new Text(hashAref(options, "body"));
    }
    if (hasKey(options, "plain")) {
      return new Text(hashAref(options, "plain"));
    }
    if (hasKey(options, "html")) {
      return new HTML(hashAref(options, "html"), this.formats[0]);
    }
    if (hasKey(options, "file")) {
      if (File.isExist(hashAref(options, "file") as string)) {
        return new RawFile(hashAref(options, "file") as string);
      } else {
        if (File.isAbsolutePath(hashAref(options, "file") as string)) {
          throw new ArgumentError(`File ${hashAref(options, "file") as string} does not exist`);
        } else {
          throw new ArgumentError(
            `\`render file:\` should be given the absolute path to a file. '${hashAref(options, "file") as string}' was given instead`,
          );
        }
      }
    }
    if (hasKey(options, "inline")) {
      const handler = Template.handlerForExtension(
        (hashAref(options, "type") as string | null) ?? "tse",
      );
      const format = rbObjRespondTo(handler, "defaultFormat")
        ? (handler as TemplateHandler & { defaultFormat: string }).defaultFormat
        : ((this.lookupContext.formats[0] as string | undefined) ?? null);
      return new Inline(hashAref(options, "inline") as string, "inline template", handler!, {
        locals: keys,
        format,
      });
    }
    if (hasKey(options, "renderable")) {
      return new Renderable(hashAref(options, "renderable"));
    }
    if (hasKey(options, "template")) {
      if (rbObjRespondTo(hashAref(options, "template"), "render")) {
        return hashAref(options, "template") as RenderableTemplate;
      }
      return this.lookupContext.findTemplate(
        hashAref(options, "template") as string,
        hashAref(options, "prefixes") as readonly string[] | null,
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
