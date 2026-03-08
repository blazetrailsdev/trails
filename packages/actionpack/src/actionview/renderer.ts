/**
 * ActionController::Renderer
 *
 * Standalone rendering outside of a request/response cycle.
 * Useful for rendering templates in background jobs, mailers,
 * or anywhere else outside a controller action.
 *
 * Usage:
 *   const renderer = Renderer.for(PostsController);
 *   const html = await renderer.render("index", { posts: [...] });
 *
 * Or with a custom LookupContext:
 *   const renderer = new Renderer(lookupContext, "posts");
 *   const html = await renderer.render("show", { post });
 */

import { LookupContext } from "./lookup-context.js";

export class Renderer {
  private lookupContext: LookupContext;
  private controllerName: string;
  private defaults: RendererDefaults;

  constructor(
    lookupContext: LookupContext,
    controllerName: string,
    defaults: RendererDefaults = {}
  ) {
    this.lookupContext = lookupContext;
    this.controllerName = controllerName;
    this.defaults = defaults;
  }

  /**
   * Create a renderer for a controller class.
   * Uses the class's static lookupContext if available.
   */
  static for(
    controllerClass: { name: string; lookupContext?: LookupContext },
    defaults: RendererDefaults = {}
  ): Renderer {
    const name = controllerClass.name
      .replace(/Controller$/, "")
      .toLowerCase();

    const ctx = controllerClass.lookupContext ?? new LookupContext();
    return new Renderer(ctx, name, defaults);
  }

  /**
   * Render a template by action name.
   *
   * @param action Action/template name (e.g., "index", "show")
   * @param locals Template variables
   * @param options Override format, layout, etc.
   */
  async render(
    action: string,
    locals: Record<string, unknown> = {},
    options: RenderOptions = {}
  ): Promise<string> {
    const format = options.format ?? this.defaults.format ?? "html";
    const layout = options.layout !== undefined ? options.layout : this.defaults.layout;

    return this.lookupContext.render(
      this.controllerName,
      action,
      format,
      { ...this.defaults.locals, ...locals },
      { layout }
    );
  }

  /**
   * Render a partial.
   *
   * @param partial Partial name (without underscore)
   * @param locals  Template variables
   * @param options Override format, etc.
   */
  async renderPartial(
    partial: string,
    locals: Record<string, unknown> = {},
    options: { format?: string } = {}
  ): Promise<string> {
    const format = options.format ?? this.defaults.format ?? "html";
    return this.lookupContext.renderPartial(
      partial,
      this.controllerName,
      format,
      { ...this.defaults.locals, ...locals }
    );
  }

  /**
   * Create a new renderer with different defaults.
   */
  withDefaults(defaults: RendererDefaults): Renderer {
    return new Renderer(this.lookupContext, this.controllerName, {
      ...this.defaults,
      ...defaults,
    });
  }
}

export interface RendererDefaults {
  format?: string;
  layout?: string | false;
  locals?: Record<string, unknown>;
}

export interface RenderOptions {
  format?: string;
  layout?: string | false;
}
