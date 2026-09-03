export interface RenderContext {
  controller: string;
  action: string;
  format: string;
  yield?: string;
  templatePath?: string;
}

export interface TemplateHandler {
  readonly extensions: string[];

  call(template: unknown, source: string): string;
}

const handlers = new Map<string, TemplateHandler>();
let defaultHandler: TemplateHandler | null = null;
let cachedExtensions: string[] | null = null;

export const TemplateHandlers = {
  registerTemplateHandler(...extensionsAndHandler: [...string[], TemplateHandler]): void {
    const handler = extensionsAndHandler[extensionsAndHandler.length - 1] as TemplateHandler;
    const extensions = extensionsAndHandler.slice(0, -1) as string[];
    if (extensions.length === 0) throw new Error("Extension is required");
    for (const extension of extensions) handlers.set(extension, handler);
    cachedExtensions = null;
  },

  unregisterTemplateHandler(...extensions: string[]): void {
    for (const ext of extensions) {
      const handler = handlers.get(ext);
      handlers.delete(ext);
      if (defaultHandler === handler) defaultHandler = null;
    }
    cachedExtensions = null;
  },

  templateHandlerExtensions(): string[] {
    return [...handlers.keys()].sort();
  },

  registeredTemplateHandler(extension: string | null | undefined): TemplateHandler | undefined {
    return extension ? handlers.get(extension) : undefined;
  },

  registerDefaultTemplateHandler(extension: string, klass: TemplateHandler): void {
    this.registerTemplateHandler(extension, klass);
    defaultHandler = klass;
  },

  handlerForExtension(extension: string | null | undefined): TemplateHandler | undefined {
    return this.registeredTemplateHandler(extension) ?? defaultHandler ?? undefined;
  },

  extensions(): string[] {
    return (cachedExtensions ??= [...handlers.keys()]);
  },

  /** @internal */
  clear(): void {
    handlers.clear();
    defaultHandler = null;
    cachedExtensions = null;
  },
};
