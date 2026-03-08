/**
 * ActionView::Template::Handler
 *
 * Interface for template engines. Each handler knows how to render
 * a specific template format (EJS, React, Svelte, Glimmer, etc.).
 *
 * To add a new template engine:
 *
 *   import { TemplateHandler, TemplateHandlerRegistry } from "@rails-ts/actionpack/actionview";
 *
 *   class ReactHandler implements TemplateHandler {
 *     extensions = ["tsx", "jsx"];
 *     async render(source, locals, options) {
 *       // Compile and render React component
 *       return renderToString(React.createElement(eval(source), locals));
 *     }
 *   }
 *
 *   TemplateHandlerRegistry.register(new ReactHandler());
 */

/**
 * The rendering context passed to handlers.
 */
export interface RenderContext {
  /** Controller name (e.g., "posts") */
  controller: string;
  /** Action name (e.g., "index") */
  action: string;
  /** Response format (e.g., "html", "json") */
  format: string;
  /** Layout content — present when rendering a layout template */
  yield?: string;
  /** The full template path for error reporting */
  templatePath?: string;
}

/**
 * A template handler knows how to render templates of a specific type.
 *
 * Implementations should be stateless — all per-render state comes
 * through the `render` method's arguments.
 */
export interface TemplateHandler {
  /** File extensions this handler supports (e.g., ["ejs"], ["tsx", "jsx"]) */
  readonly extensions: string[];

  /**
   * Render a template source string to output.
   *
   * @param source  The raw template source code
   * @param locals  Variables available to the template
   * @param context Rendering context (controller, action, format, yield)
   * @returns The rendered output string (may be async)
   */
  render(
    source: string,
    locals: Record<string, unknown>,
    context: RenderContext
  ): string | Promise<string>;
}

/**
 * Global registry of template handlers, keyed by file extension.
 *
 * Rails equivalent: ActionView::Template.registered_template_handler
 */
export class TemplateHandlerRegistry {
  private static handlers = new Map<string, TemplateHandler>();
  private static defaultExtension: string | null = null;

  /** Register a handler for its declared extensions. */
  static register(handler: TemplateHandler): void {
    for (const ext of handler.extensions) {
      this.handlers.set(ext, handler);
    }
    // First registered handler becomes default
    if (!this.defaultExtension && handler.extensions.length > 0) {
      this.defaultExtension = handler.extensions[0];
    }
  }

  /** Get the handler for a file extension. */
  static handlerForExtension(ext: string): TemplateHandler | undefined {
    return this.handlers.get(ext);
  }

  /** Get all registered extensions. */
  static get extensions(): string[] {
    return [...this.handlers.keys()];
  }

  /** Get the default handler extension. */
  static get defaultExt(): string | null {
    return this.defaultExtension;
  }

  /** Set the default handler extension. */
  static setDefault(ext: string): void {
    if (!this.handlers.has(ext)) {
      throw new Error(`No handler registered for extension "${ext}"`);
    }
    this.defaultExtension = ext;
  }

  /** Unregister all handlers (useful for testing). */
  static clear(): void {
    this.handlers.clear();
    this.defaultExtension = null;
  }

  /** Check if an extension has a registered handler. */
  static has(ext: string): boolean {
    return this.handlers.has(ext);
  }
}
