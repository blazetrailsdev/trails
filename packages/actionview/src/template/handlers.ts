/**
 * ActionView::Template::Handlers
 *
 * Registry of template handlers, keyed by file extension. Rails mixes this
 * module into `ActionView::Template` via `extend` so `Template` itself
 * answers `register_template_handler` / `handler_for_extension` / etc.
 *
 * To add a new template engine:
 *
 *   import { TemplateHandlers } from "@blazetrails/actionview";
 *   TemplateHandlers.registerTemplateHandler("tse", new TseHandler());
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
  /** File extensions this handler supports (e.g., ["tse"], ["tsx", "jsx"]) */
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
    context: RenderContext,
  ): string | Promise<string>;
}

const handlers = new Map<string, TemplateHandler>();
let defaultHandler: TemplateHandler | null = null;
let cachedExtensions: string[] | null = null;

/**
 * ActionView::Template::Handlers — registry of template handlers.
 *
 * Rails mirror: `action_view/template/handlers.rb`.
 */
export const TemplateHandlers = {
  /**
   * Register an object that knows how to handle template files with one or
   * more extensions. The handler must implement {@link TemplateHandler}.
   * Rails: `register_template_handler(*extensions, handler)` — variadic
   * extensions with the handler as the trailing argument. Raises
   * `ArgumentError` (here, a plain `Error`) when no extension is supplied.
   */
  registerTemplateHandler(...extensionsAndHandler: [...string[], TemplateHandler]): void {
    const handler = extensionsAndHandler[extensionsAndHandler.length - 1] as TemplateHandler;
    const extensions = extensionsAndHandler.slice(0, -1) as string[];
    if (extensions.length === 0) throw new Error("Extension is required");
    for (const extension of extensions) handlers.set(extension, handler);
    cachedExtensions = null;
  },

  /** Opposite to {@link registerTemplateHandler}. */
  unregisterTemplateHandler(...extensions: string[]): void {
    for (const ext of extensions) {
      const handler = handlers.get(ext);
      handlers.delete(ext);
      if (defaultHandler === handler) defaultHandler = null;
    }
    cachedExtensions = null;
  },

  /** Sorted list of registered extensions, as strings. */
  templateHandlerExtensions(): string[] {
    return [...handlers.keys()].sort();
  },

  /** Return the handler registered for `extension`, or undefined. */
  registeredTemplateHandler(extension: string | null | undefined): TemplateHandler | undefined {
    return extension ? handlers.get(extension) : undefined;
  },

  /**
   * Register a handler and make it the default returned by
   * {@link handlerForExtension} when an unknown extension is requested.
   */
  registerDefaultTemplateHandler(extension: string, handler: TemplateHandler): void {
    this.registerTemplateHandler(extension, handler);
    defaultHandler = handler;
  },

  /** Handler for `extension`, falling back to the default handler. */
  handlerForExtension(extension: string | null | undefined): TemplateHandler | undefined {
    return this.registeredTemplateHandler(extension) ?? defaultHandler ?? undefined;
  },

  /**
   * All registered extensions, lazily memoized. Rails memoizes via
   * `@@template_extensions ||= @@template_handlers.keys`.
   */
  extensions(): string[] {
    return (cachedExtensions ??= [...handlers.keys()]);
  },

  /**
   * Clear all registered handlers. Not in Rails — useful for test isolation.
   * @internal
   */
  clear(): void {
    handlers.clear();
    defaultHandler = null;
    cachedExtensions = null;
  },
};

/**
 * Back-compat alias. The previous name was `TemplateHandlerRegistry`; the
 * Rails-mirroring name is `TemplateHandlers`.
 *
 * @deprecated Use {@link TemplateHandlers}.
 */
export const TemplateHandlerRegistry = {
  register(handler: TemplateHandler): void {
    for (const ext of handler.extensions) {
      TemplateHandlers.registerTemplateHandler(ext, handler);
    }
    if (legacyDefaultExt === null && handler.extensions.length > 0) {
      legacyDefaultExt = handler.extensions[0]!;
    }
  },
  handlerForExtension(ext: string): TemplateHandler | undefined {
    return TemplateHandlers.handlerForExtension(ext);
  },
  get extensions(): string[] {
    return TemplateHandlers.extensions();
  },
  has(ext: string): boolean {
    return TemplateHandlers.registeredTemplateHandler(ext) !== undefined;
  },
  get defaultExt(): string | null {
    return legacyDefaultExt;
  },
  setDefault(ext: string): void {
    if (TemplateHandlers.registeredTemplateHandler(ext) === undefined) {
      throw new Error(`No handler registered for extension "${ext}"`);
    }
    legacyDefaultExt = ext;
  },
  clear(): void {
    TemplateHandlers.clear();
    legacyDefaultExt = null;
  },
};

let legacyDefaultExt: string | null = null;
