import { Notifications } from "@blazetrails/activesupport";

import { ArgumentError, File } from "@blazetrails/ruby-compat";

import { LookupContext, MissingTemplate } from "../lookup-context.js";
import { RawFile } from "../template/raw-file.js";
import { AbstractRenderer, RenderedTemplate } from "./abstract-renderer.js";
import type { RenderableTemplate, ViewContext, RenderOptions } from "./abstract-renderer.js";

/** @internal */
export class TemplateRenderer extends AbstractRenderer {
  /** @internal */
  private details: Record<string, readonly (string | symbol)[]> = {};

  constructor(lookupContext: LookupContext) {
    super(lookupContext);
  }

  async render(context: ViewContext, options: RenderOptions): Promise<RenderedTemplate> {
    this.details = this.extractDetails(options as Record<string, unknown>);
    const template = this.determineTemplate(options);
    this.prependFormats(template.format ? [template.format] : null);
    return this.renderTemplate(context, template, options.layout, options.locals ?? {});
  }

  /** @internal */
  private determineTemplate(options: RenderOptions): RenderableTemplate {
    const keys = options.locals ? Object.keys(options.locals) : [];

    if (Object.prototype.hasOwnProperty.call(options, "body")) {
      return new BodyTemplate(String(options.body ?? ""));
    }
    if (Object.prototype.hasOwnProperty.call(options, "plain")) {
      return new PlainTemplate(String(options.plain ?? ""));
    }
    if (Object.prototype.hasOwnProperty.call(options, "html")) {
      return new HtmlTemplate(String(options.html ?? ""), (this.formats[0] as string) ?? "html");
    }
    if (Object.prototype.hasOwnProperty.call(options, "file")) {
      if (File.isExist(options.file as string)) {
        return new RawFile(options.file) as unknown as RenderableTemplate;
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
      const inlineFormat = (this.formats[0] as string | undefined) ?? null;
      return new InlineTemplate(String(options.inline ?? ""), inlineFormat);
    }
    if (Object.prototype.hasOwnProperty.call(options, "renderable") && options.renderable) {
      return new RenderableWrapper(options.renderable);
    }
    if (Object.prototype.hasOwnProperty.call(options, "template") && options.template != null) {
      const tmpl = options.template;
      if (typeof tmpl === "object" && typeof tmpl.render === "function") {
        return tmpl;
      }
      return this.findTemplateForName(tmpl as string, options.prefixes ?? [], keys);
    }
    throw new Error(
      "You invoked render but did not give any of :body, :file, :html, :inline, :partial, :plain, :renderable, or :template option.",
    );
  }

  /** @internal */
  private async renderTemplate(
    view: ViewContext,
    template: RenderableTemplate,
    layoutName: RenderOptions["layout"],
    locals: Record<string, unknown>,
  ): Promise<RenderedTemplate> {
    return this.renderWithLayout(view, template, layoutName, locals, (layout) =>
      Notifications.instrument<Promise<string>>(
        "render_template.action_view",
        {
          identifier: template.identifier,
          layout: layout && layout.virtualPath,
          locals,
        },
        async () => template.render(view, locals),
      ),
    );
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
        ? this.findLayout(path, Object.keys(locals), [(this.formats[0] as string) ?? "html"])
        : null;

    let body: string;
    if (layout) {
      body = await Notifications.instrument<Promise<string>>(
        "render_layout.action_view",
        { identifier: layout.identifier },
        async () => {
          view.viewFlow?.set("layout", await block(layout));
          return layout.render(view, locals);
        },
      );
    } else {
      body = await block(null);
    }
    return this.buildRenderedTemplate(body, template);
  }

  /** @internal */
  private findLayout(
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
          return this.lookupContext.find(layout, [], false, keys, details) as RenderableTemplate;
        }
      } catch (e) {
        if (!(e instanceof MissingTemplate)) throw e;
        const allDetails = {
          ...this.details,
          formats: LookupContext._defaultProcs()["formats"]() as readonly string[],
        };
        if (!this.templateExists(layout, [], false, keys, allDetails)) throw e;
        return null;
      }
    }
    if (typeof layout === "function") {
      const resolved = layout(this.lookupContext, this.formats as readonly string[], keys);
      return resolved ? this.resolveLayout(resolved, keys, formats) : null;
    }
    return null;
  }

  /** @internal */
  private findTemplateForName(
    name: string,
    prefixes: readonly string[],
    keys: readonly string[],
  ): RenderableTemplate {
    const found = this.lookupContext.findAll(
      name,
      prefixes as string[],
      false,
      keys,
      this.details,
    ) as RenderableTemplate[];
    if (found.length > 0) return found[0];

    const lastSlash = name.lastIndexOf("/");
    const baseName = lastSlash >= 0 ? name.slice(lastSlash + 1) : name;
    const prefix = lastSlash >= 0 ? name.slice(0, lastSlash) : (prefixes[0] ?? "");
    const format = (this.formats[0] as string | undefined) ?? "html";
    const template = this.lookupContext.findTemplate(baseName, [prefix], [format]);
    if (template) return template as unknown as RenderableTemplate;

    throw new MissingTemplate(prefix, baseName, format, [], []);
  }
}

class BodyTemplate implements RenderableTemplate {
  readonly identifier = "body template";
  readonly format = null;

  constructor(private readonly content: string) {}

  async render(..._args: unknown[]): Promise<string> {
    return this.content;
  }
}

class PlainTemplate implements RenderableTemplate {
  readonly identifier = "plain template";
  readonly format = "text";

  constructor(private readonly content: string) {}

  async render(..._args: unknown[]): Promise<string> {
    return this.content;
  }
}

class HtmlTemplate implements RenderableTemplate {
  readonly identifier = "html template";

  constructor(
    private readonly content: string,
    readonly format: string,
  ) {}

  async render(..._args: unknown[]): Promise<string> {
    return this.content;
  }
}

class InlineTemplate implements RenderableTemplate {
  readonly identifier = "inline template";

  constructor(
    private readonly source: string,
    readonly format: string | null,
  ) {}

  async render(..._args: unknown[]): Promise<string> {
    return this.source;
  }
}

class RenderableWrapper implements RenderableTemplate {
  readonly identifier = "renderable";
  readonly format = null;

  constructor(private readonly inner: { renderIn(context: ViewContext): string }) {}

  async render(context: ViewContext, ..._args: unknown[]): Promise<string> {
    return this.inner.renderIn(context ?? {});
  }
}
