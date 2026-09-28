import {
  attrInternal,
  h,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  InheritableOptions,
  initializeIncludedModules,
  jsonEscape,
  runLoadHooks,
  xmlNameEscape,
  type SafeBuffer,
} from "@blazetrails/activesupport";

import "./log-subscriber.js";
import { ActionView } from "./namespaces.js";
import { OutputBuffer } from "./buffers.js";
import { Context } from "./context.js";
import * as Helpers from "./helpers/index.js";
import { LookupContext } from "./lookup-context.js";
import type { Template } from "./template.js";
import { StrictLocalsError } from "./template/error.js";
import type { RenderOptions } from "./renderer/abstract-renderer.js";
import { Renderer } from "./renderer/renderer.js";
import {
  ArgumentError,
  excBacktraceLocations,
  extend,
  include,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { Resolver } from "./template/resolver.js";

export type CompiledMethod = ((
  this: Base,
  localAssigns: Record<string, unknown>,
  outputBuffer: OutputBuffer,
  kwargs?: Record<string, unknown>,
  block?: (...name: unknown[]) => unknown,
) => unknown) & { parameters?: Array<[type: string, name?: string]> };

export interface CompiledMethodContainer {
  _compiledMethods: Map<string, CompiledMethod>;
}

type HelperMethods = {
  [K in keyof typeof Helpers as (typeof Helpers)[K] extends (...args: never) => unknown
    ? K extends Capitalize<string & K>
      ? never
      : K
    : never]: (typeof Helpers)[K];
};

interface TseUtilMethods {
  h: typeof h;
  htmlEscape: typeof htmlEscape;
  htmlEscapeOnce: typeof htmlEscapeOnce;
  jsonEscape: typeof jsonEscape;
  xmlNameEscape: typeof xmlNameEscape;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Helpers, Context` (base.rb:158); the class/interface merge is how a mixin surfaces on the type side.
export class Base {
  static streamingCompletionOnException = `"><script>window.location = "/500.html"</script></html>`;

  static defaultFormats: readonly string[] | null = null;

  static annotateRenderedViewWithFilenames: boolean = false;

  static prefixPartialPathWithControllerNamespace: boolean = true;

  static automaticallyDisableSubmitTag: boolean = true;

  static fieldErrorProc: (this: Base, htmlTag: unknown, instance: unknown) => unknown = function (
    this: Base,
    htmlTag: unknown,
  ) {
    return this.contentTag("div", htmlTag, { class: "field_with_errors" });
  };

  static _routes: unknown = null;

  static logger: unknown = null;

  static _compiledMethods: Map<string, CompiledMethod> = new Map();

  static get cacheTemplateLoading(): boolean {
    return Resolver.isCaching();
  }

  static set cacheTemplateLoading(value: boolean) {
    Resolver.caching = value;
  }

  static isXssSafe(): boolean {
    return true;
  }

  static withEmptyTemplateCache(): typeof Base {
    const subclass = class extends this {
      static override _compiledMethods: Map<string, CompiledMethod> = new Map();

      static override compiledMethodContainer(): CompiledMethodContainer {
        return subclass;
      }

      override compiledMethodContainer(): CompiledMethodContainer {
        return subclass;
      }

      inspect(): string {
        return "#<ActionView::Base>";
      }
    };
    return subclass;
  }

  static compiledMethodContainer(): CompiledMethodContainer {
    throw new Error(
      "Subclasses of ActionView::Base must implement `compiledMethodContainer` " +
        "or use the class method `withEmptyTemplateCache` for constructing " +
        "an ActionView::Base subclass that has an empty cache.",
    );
  }

  static isChanged(other: typeof Base): boolean {
    return this.compiledMethodContainer() !== other.compiledMethodContainer();
  }

  static empty(): Base {
    return this.withViewPaths([]);
  }

  static withViewPaths(
    viewPaths: ConstructorParameters<typeof LookupContext>[0],
    assigns: Record<string, unknown> = {},
    controller: unknown = null,
  ): Base {
    return this.withContext(new LookupContext(viewPaths), assigns, controller);
  }

  static withContext(
    context: LookupContext | null,
    assigns: Record<string, unknown> = {},
    controller: unknown = null,
  ): Base {
    return new this(context, assigns, controller);
  }

  private _viewRenderer: Renderer;
  private _lookupContext: LookupContext | null;

  get viewRenderer(): Renderer {
    return this._viewRenderer;
  }

  get lookupContext(): LookupContext | null {
    return this._lookupContext;
  }

  get formats(): LookupContext["formats"] | undefined {
    return this.lookupContext?.formats;
  }

  set formats(values: LookupContext["formats"]) {
    if (this.lookupContext) this.lookupContext.formats = values;
  }

  get locale(): LookupContext["locale"] | undefined {
    return this.lookupContext?.locale;
  }

  set locale(value: LookupContext["locale"]) {
    if (this.lookupContext) this.lookupContext.locale = value;
  }

  get viewPaths(): LookupContext["viewPaths"] | undefined {
    return this.lookupContext?.viewPaths;
  }

  _assigns: Record<string, unknown> = {};

  virtualPath: string | null = null;

  /** @noRailsEquivalent PERMANENT */
  currentTemplate: Template | null = null;

  _controller: Parameters<typeof Helpers.assignController>[0] = null;

  _request: unknown = null;

  _config: unknown = null;

  _defaultFormBuilder: unknown = null;

  declare defaultFormBuilder: unknown;

  get assigns(): Record<string, unknown> {
    return this._assigns;
  }

  set assigns(value: Record<string, unknown>) {
    this._assigns = value;
  }

  get config(): unknown {
    return this._config;
  }

  set config(value: unknown) {
    this._config = value;
  }

  constructor(
    lookupContext: LookupContext | null = null,
    assigns: Record<string, unknown> = {},
    controller: unknown = null,
  ) {
    this._config = new InheritableOptions();
    this._lookupContext = lookupContext;
    this._viewRenderer = new Renderer(this._lookupContext!);
    this.currentTemplate = null;
    this.assignController(controller as Parameters<typeof Helpers.assignController>[0]);
    this._prepareContext();

    initializeIncludedModules(this);

    this.assign(assigns);
  }

  assign(newAssigns: Record<string, unknown>): void {
    this._assigns = newAssigns;
    for (const [key, value] of Object.entries(newAssigns)) {
      (this as unknown as Record<string, unknown>)[key] = value;
    }
  }

  compiledMethodContainer(): CompiledMethodContainer {
    return (this.constructor as typeof Base).compiledMethodContainer();
  }

  /** @missingRailsArgs _run — PERMANENT */
  _run(
    method: string,
    template: Template | null,
    locals: Record<string, unknown>,
    buffer: OutputBuffer,
    options: { addToStack?: boolean; hasStrictLocals?: boolean } = {},
    block?: (...name: unknown[]) => unknown,
  ): unknown {
    const compiled = this.compiledMethodContainer()._compiledMethods.get(method);
    if (!compiled) throw new Error(`undefined method '${method}'`);
    const addToStack = options.addToStack ?? true;
    const hasStrictLocals = options.hasStrictLocals ?? false;
    const oldOutputBuffer = this.outputBuffer;
    const oldVirtualPath = this.virtualPath;
    const oldTemplate = this.currentTemplate;
    if (addToStack) this.currentTemplate = template;
    this.outputBuffer = buffer;
    const rescueArgumentError = (argumentError: unknown): never => {
      if (!(argumentError instanceof ArgumentError)) throw argumentError;
      const frame = excBacktraceLocations(argumentError)?.[1];
      if (frame?.label === "_run") {
        throw new StrictLocalsError(argumentError, this.currentTemplate!);
      }
      throw argumentError;
    };
    const ensure = (): void => {
      this.outputBuffer = oldOutputBuffer;
      this.virtualPath = oldVirtualPath;
      this.currentTemplate = oldTemplate;
    };
    let result: unknown;
    try {
      if (hasStrictLocals) {
        try {
          result = compiled.call(this, locals, buffer, locals, block);
        } catch (argumentError) {
          rescueArgumentError(argumentError);
        }
        if (result instanceof Promise) result = result.catch(rescueArgumentError);
      } else {
        result = compiled.call(this, locals, buffer, undefined, block);
      }
    } catch (error) {
      ensure();
      throw error;
    }
    if (result instanceof Promise) return result.finally(ensure);
    ensure();
    return result;
  }

  render(
    options: RenderOptions | string | object = {},
    locals: Record<string, unknown> = {},
    block?: () => unknown,
  ): SafeBuffer | Promise<SafeBuffer> {
    if ((options as object | null)?.constructor === Object) {
      const hash = options as RenderOptions;
      return this.inRenderingContext(hash, () => {
        if (block) {
          return renderedBody(
            this.viewRenderer.renderPartial(
              this,
              { ...hash, partial: hash.layout as RenderOptions["partial"] },
              block,
            ),
          );
        } else {
          return renderedBody(this.viewRenderer.render(this, hash));
        }
      });
    } else {
      if (rbObjRespondTo(options, "renderIn")) {
        return (options as { renderIn(context: Base, block?: () => unknown): SafeBuffer }).renderIn(
          this,
          block,
        );
      } else {
        return renderedBody(
          this.viewRenderer.renderPartial(
            this,
            { partial: options as RenderOptions["partial"], locals },
            block,
          ),
        );
      }
    }
  }

  inRenderingContext<T>(options: RenderOptions, block: (renderer: Renderer) => T): T {
    const oldViewRenderer = this._viewRenderer;
    const oldLookupContext = this._lookupContext;

    if (!this.lookupContext?.htmlFallbackForJs && options.formats) {
      const formats = Array.isArray(options.formats) ? [...options.formats] : [options.formats];
      if (formats.length === 1 && formats[0] === ":js") {
        formats.push(":html");
      }
      this._lookupContext = this.lookupContext!.withPrependedFormats(formats);
      this._viewRenderer = new Renderer(this._lookupContext);
    }

    const restore = (): void => {
      this._viewRenderer = oldViewRenderer;
      this._lookupContext = oldLookupContext;
    };
    let result: T;
    try {
      result = block(this._viewRenderer);
    } catch (error) {
      restore();
      throw error;
    }
    if (result instanceof Promise) return result.finally(restore) as T;
    restore();
    return result;
  }
}

/** @noRailsEquivalent CONVERGEABLE template-render-returns-output-buffer-to-s */
function renderedBody(
  body: string | SafeBuffer | null | Promise<string | SafeBuffer | null>,
): SafeBuffer | Promise<SafeBuffer> {
  if (typeof (body as Promise<string | SafeBuffer | null> | null)?.then === "function") {
    return (body as Promise<string | SafeBuffer | null>).then((b) => htmlSafe(String(b ?? "")));
  }
  return htmlSafe(String(body ?? ""));
}

const TseUtil = { h, htmlEscape, htmlEscapeOnce, jsonEscape, xmlNameEscape };
for (const [name, value] of Object.entries(TseUtil)) {
  (Base.prototype as unknown as Record<string, unknown>)[name] = value;
}

Helpers.installControllerInternals(Base.prototype);
attrInternal.call(Base.prototype, "defaultFormBuilder");
Helpers.installControllerDelegates(Base.prototype);

for (const [name, value] of Object.entries(Helpers)) {
  if (typeof value !== "function") continue;
  if (name[0] !== name[0]?.toLowerCase()) continue;
  (Base.prototype as unknown as Record<string, unknown>)[name] = value;
}

Object.defineProperty(Base.prototype, "yield", {
  get(this: Base): SafeBuffer | Promise<SafeBuffer> {
    return this._layoutFor();
  },
  enumerable: false,
  configurable: true,
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface Base extends Context, HelperMethods, TseUtilMethods {
  controller: Parameters<typeof Helpers.assignController>[0];
  request: unknown;
  _backUrl: typeof Helpers._backUrl;
  _filteredReferrer: typeof Helpers._filteredReferrer;
  /** @noRailsEquivalent PERMANENT */
  readonly yield: SafeBuffer;
}

include(Base, Context);
extend(Base, Helpers.UrlHelperClassMethods);

runLoadHooks("action_view", Base);

ActionView.Base = Base;
