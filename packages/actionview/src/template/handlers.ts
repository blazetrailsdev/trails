import {
  ArgumentError,
  classModule,
  extended,
  stringToSym,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { Builder } from "./handlers/builder.js";
import { Html } from "./handlers/html.js";
import { Raw } from "./handlers/raw.js";
import { TSE } from "./handlers/tse.js";

export interface RenderContext {
  controller: string;
  action: string;
  format: string;
  yield?: string;
  templatePath?: string;
}

export interface TemplateHandler {
  call(template: unknown, source: string): string;
  handlesEncoding?(): boolean;
}

const handlers = new Map<string, TemplateHandler>();
let defaultHandler: TemplateHandler | null = null;
let cachedExtensions: string[] | null = null;

interface HandlersHost {
  registerTemplateHandler(...extensionsAndHandler: [...string[], TemplateHandler]): void;
  registeredTemplateHandler(extension: string | null | undefined): TemplateHandler | undefined;
  registerDefaultTemplateHandler(extension: string, klass: TemplateHandler): void;
}

export class Handlers {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  static [extended](base: HandlersHost): void {
    base.registerDefaultTemplateHandler("raw", new Raw());
    base.registerTemplateHandler("tse", new TSE());
    base.registerTemplateHandler("html", new Html());
    base.registerTemplateHandler("builder", new Builder());
    base.registerTemplateHandler("ruby", {
      call: (_: unknown, source: string) => source,
    });
  }

  static extensions(): string[] {
    return (cachedExtensions ??= [...handlers.keys()]);
  }

  /** @internal */
  static clear(): void {
    handlers.clear();
    defaultHandler = null;
    cachedExtensions = null;
  }

  registerTemplateHandler(...extensionsAndHandler: [...string[], TemplateHandler]): void {
    const handler = extensionsAndHandler[extensionsAndHandler.length - 1] as TemplateHandler;
    const extensions = extensionsAndHandler.slice(0, -1) as string[];
    if (extensions.length === 0) throw new ArgumentError("Extension is required");
    for (const extension of extensions) handlers.set(stringToSym(extension), handler);
    cachedExtensions = null;
  }

  unregisterTemplateHandler(...extensions: string[]): void {
    for (const ext of extensions) {
      const handler = handlers.get(stringToSym(ext));
      handlers.delete(stringToSym(ext));
      if (defaultHandler === handler) defaultHandler = null;
    }
    cachedExtensions = null;
  }

  templateHandlerExtensions(): string[] {
    return [...handlers.keys()].map(symbolToS).sort();
  }

  registeredTemplateHandler(extension: string | null | undefined): TemplateHandler | undefined {
    return extension ? handlers.get(stringToSym(extension)) : undefined;
  }

  registerDefaultTemplateHandler(
    this: HandlersHost,
    extension: string,
    klass: TemplateHandler,
  ): void {
    this.registerTemplateHandler(extension, klass);
    defaultHandler = klass;
  }

  handlerForExtension(
    this: HandlersHost,
    extension: string | null | undefined,
  ): TemplateHandler | undefined {
    return this.registeredTemplateHandler(extension) ?? defaultHandler ?? undefined;
  }
}
