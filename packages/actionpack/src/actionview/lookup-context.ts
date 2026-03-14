/**
 * ActionView::LookupContext
 *
 * Orchestrates template resolution and rendering. Combines resolvers
 * (which find templates) with handlers (which render them).
 *
 * Usage:
 *   const ctx = new LookupContext();
 *   ctx.addResolver(new FileSystemResolver("app/views"));
 *   ctx.addResolver(new InMemoryResolver()); // fallback
 *
 *   const output = await ctx.render("posts", "index", "html", { posts: [...] });
 */

import type { RenderContext } from "./template-handler.js";
import { TemplateHandlerRegistry } from "./template-handler.js";
import type { TemplateResolver } from "./template-resolver.js";
import type { Template } from "./template.js";

export class MissingTemplate extends Error {
  constructor(
    public readonly controller: string,
    public readonly action: string,
    public readonly format: string,
    public readonly searchedPaths: string[],
  ) {
    super(
      `Missing template ${controller}/${action} with format "${format}". ` +
        `Searched in: ${searchedPaths.length > 0 ? searchedPaths.join(", ") : "(no resolvers)"}`,
    );
    this.name = "MissingTemplate";
  }
}

export class LookupContext {
  private resolvers: TemplateResolver[] = [];
  private layoutName: string | false | null = "application";
  private _prefixes: string[] = [];

  /** Add a resolver to the lookup chain. First added = highest priority. */
  addResolver(resolver: TemplateResolver): void {
    this.resolvers.push(resolver);
  }

  /** Set the layout to use. Pass false to disable layout. */
  setLayout(name: string | false): void {
    this.layoutName = name;
  }

  /** Get the current layout name. */
  getLayout(): string | false | null {
    return this.layoutName;
  }

  /** Set view prefixes (for controller inheritance lookup). */
  set prefixes(value: string[]) {
    this._prefixes = value;
  }

  get prefixes(): string[] {
    return this._prefixes;
  }

  /**
   * Find a template across all resolvers.
   */
  findTemplate(name: string, prefix: string, format: string): Template | null {
    const extensions = TemplateHandlerRegistry.extensions;
    if (extensions.length === 0) return null;

    for (const resolver of this.resolvers) {
      const template = resolver.find(name, prefix, format, extensions);
      if (template) return template;
    }
    return null;
  }

  /**
   * Find a partial template. Partials are prefixed with underscore.
   */
  findPartial(name: string, prefix: string, format: string): Template | null {
    return this.findTemplate(`_${name}`, prefix, format);
  }

  /**
   * Find a layout template.
   */
  findLayout(name: string, format: string): Template | null {
    const extensions = TemplateHandlerRegistry.extensions;
    if (extensions.length === 0) return null;

    for (const resolver of this.resolvers) {
      if (resolver.findLayout) {
        const layout = resolver.findLayout(name, format, extensions);
        if (layout) return layout;
      }
      // Fallback: look in "layouts" prefix
      const template = resolver.find(name, "layouts", format, extensions);
      if (template) {
        return { ...template, isLayout: true };
      }
    }
    return null;
  }

  /**
   * Render a template by controller/action.
   *
   * @param controller Controller name (e.g., "posts")
   * @param action     Action name (e.g., "index")
   * @param format     Response format (e.g., "html")
   * @param locals     Template variables
   * @param options    Additional options
   * @returns Rendered output string
   */
  async render(
    controller: string,
    action: string,
    format: string,
    locals: Record<string, unknown> = {},
    options: { layout?: string | false } = {},
  ): Promise<string> {
    const template = this.findTemplate(action, controller, format);
    if (!template) {
      throw new MissingTemplate(controller, action, format, this.resolverNames());
    }

    const context: RenderContext = {
      controller,
      action,
      format,
    };

    // Render the template
    let output = await this.renderTemplate(template, locals, context);

    // Apply layout
    const layoutName = options.layout !== undefined ? options.layout : this.layoutName;
    if (layoutName !== false && layoutName) {
      const layoutTemplate = this.findLayout(layoutName, format);
      if (layoutTemplate) {
        const layoutContext: RenderContext = {
          ...context,
          yield: output,
        };
        output = await this.renderTemplate(layoutTemplate, locals, layoutContext);
      }
    }

    return output;
  }

  /**
   * Render a partial.
   *
   * @param name       Partial name (without underscore prefix)
   * @param prefix     Controller prefix
   * @param format     Response format
   * @param locals     Template variables
   * @returns Rendered partial output
   */
  async renderPartial(
    name: string,
    prefix: string,
    format: string,
    locals: Record<string, unknown> = {},
  ): Promise<string> {
    const template = this.findPartial(name, prefix, format);
    if (!template) {
      throw new MissingTemplate(prefix, `_${name}`, format, this.resolverNames());
    }

    const context: RenderContext = {
      controller: prefix,
      action: `_${name}`,
      format,
    };

    return this.renderTemplate(template, locals, context);
  }

  /**
   * Render a collection of items with a partial.
   *
   * @param partial    Partial name
   * @param prefix     Controller prefix
   * @param format     Response format
   * @param collection Array of items
   * @param as         Local variable name for each item (defaults to partial name)
   * @returns Rendered collection output
   */
  async renderCollection(
    partial: string,
    prefix: string,
    format: string,
    collection: unknown[],
    as?: string,
  ): Promise<string> {
    const varName = as ?? partial;
    const parts: string[] = [];

    for (let i = 0; i < collection.length; i++) {
      const locals: Record<string, unknown> = {
        [varName]: collection[i],
        [`${varName}_counter`]: i,
        [`${varName}_iteration`]: { index: i, first: i === 0, last: i === collection.length - 1 },
      };
      parts.push(await this.renderPartial(partial, prefix, format, locals));
    }

    return parts.join("");
  }

  /**
   * Render a Template with its handler.
   */
  async renderTemplate(
    template: Template,
    locals: Record<string, unknown>,
    context: RenderContext,
  ): Promise<string> {
    const handler = TemplateHandlerRegistry.handlerForExtension(template.extension);
    if (!handler) {
      throw new Error(
        `No template handler registered for ".${template.extension}". ` +
          `Register one with TemplateHandlerRegistry.register(handler).`,
      );
    }

    return handler.render(template.source, locals, {
      ...context,
      templatePath: template.fullPath ?? template.identifier,
    });
  }

  private resolverNames(): string[] {
    return this.resolvers.map((r) => r.constructor.name);
  }
}
