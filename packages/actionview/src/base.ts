import {
  cattrAccessor,
  classAttribute,
  delegate,
  h,
  htmlEscape,
  htmlEscapeOnce,
  InheritableOptions,
  jsonEscape,
  runLoadHooks,
  TopLevel,
  TseUtil,
  xmlNameEscape,
  type SafeBuffer,
} from "@blazetrails/activesupport";

import "./log-subscriber.js";
import { ActionView } from "./namespaces.js";
import { OutputBuffer } from "./buffers.js";
import { Context } from "./context.js";
import { Helpers } from "./helpers.js";
import type * as HelperExports from "./helpers/index.js";
import type { _objectForFormBuilder } from "./helpers/form-helper.js";
import type { _backUrl, _filteredReferrer } from "./helpers/url-helper.js";
import { assignController } from "./helpers/controller-helper.js";
import { LookupContext } from "./lookup-context.js";
import type { Template } from "./template.js";
import { StrictLocalsError } from "./template/error.js";
import type { RenderOptions } from "./renderer/abstract-renderer.js";
import { Renderer } from "./renderer/renderer.js";
import {
  ArgumentError,
  excBacktraceLocations,
  include,
  isModuleIncluded,
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
  [K in keyof typeof HelperExports as (typeof HelperExports)[K] extends (...args: never) => unknown
    ? K extends Capitalize<string & K>
      ? never
      : K
    : never]: (typeof HelperExports)[K];
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
  declare static fieldErrorProc: (this: Base, htmlTag: unknown, instance: unknown) => unknown;
  declare fieldErrorProc: (this: Base, htmlTag: unknown, instance: unknown) => unknown;
  declare static streamingCompletionOnException: string;
  declare streamingCompletionOnException: string;
  declare static prefixPartialPathWithControllerNamespace: boolean;
  declare static isPrefixPartialPathWithControllerNamespace: boolean;
  declare prefixPartialPathWithControllerNamespace: boolean;
  declare static defaultFormats: readonly string[] | null | undefined;
  declare defaultFormats: readonly string[] | null | undefined;
  declare static automaticallyDisableSubmitTag: boolean;
  declare automaticallyDisableSubmitTag: boolean;
  declare static debugMissingTranslation: boolean;
  declare debugMissingTranslation: boolean;
  declare static annotateRenderedViewWithFilenames: boolean;
  declare annotateRenderedViewWithFilenames: boolean;
  declare static _routes: unknown;
  declare static is_routes: boolean;
  declare _routes: unknown;
  declare static logger: unknown;
  declare static isLogger: boolean;
  declare logger: unknown;
  declare static tseTrimMode: string;

  static {
    cattrAccessor.call(this, "fieldErrorProc", {
      default: () =>
        function (this: Base, htmlTag: unknown, _instance: unknown) {
          return this.contentTag("div", htmlTag, { class: "field_with_errors" });
        },
    });
    cattrAccessor.call(this, "streamingCompletionOnException", {
      default: `"><script>window.location = "/500.html"</script></html>`,
    });
    classAttribute.call(this, "prefixPartialPathWithControllerNamespace", { default: true });
    cattrAccessor.call(this, "defaultFormats");
    cattrAccessor.call(this, "automaticallyDisableSubmitTag", { default: true });
    cattrAccessor.call(this, "annotateRenderedViewWithFilenames", { default: false });
    classAttribute.call(this, "_routes");
    classAttribute.call(this, "logger");
    delegate.call(this, "tseTrimMode=", { to: "::ActionView::Template::Handlers::TSE" });
  }

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

  _controller: Parameters<typeof assignController>[0] = null;

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

  /** @inventedArm if — PERMANENT */
  constructor(
    lookupContext: LookupContext | null = null,
    assigns: Record<string, unknown> = {},
    controller: unknown = null,
  ) {
    if (isModuleIncluded(new.target, TopLevel.ActionDispatch?.Routing.UrlFor as never)) {
      this._routes = null;
    }
    this._config = new InheritableOptions();
    this._lookupContext = lookupContext;
    this._viewRenderer = new Renderer(this._lookupContext!);
    this.currentTemplate = null;
    this.assignController(controller as Parameters<typeof assignController>[0]);
    this._prepareContext();

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
  ): string | SafeBuffer | null | Promise<string | SafeBuffer | null> {
    if ((options as object | null)?.constructor === Object) {
      return this.inRenderingContext(options as RenderOptions, () => {
        if (block) {
          return this.viewRenderer.renderPartial(
            this,
            {
              ...(options as RenderOptions),
              partial: (options as RenderOptions).layout as RenderOptions["partial"],
            },
            block,
          );
        } else {
          return this.viewRenderer.render(this, options as RenderOptions);
        }
      });
    } else {
      if (rbObjRespondTo(options, "renderIn")) {
        return (options as { renderIn(context: Base, block?: () => unknown): SafeBuffer }).renderIn(
          this,
          block,
        );
      } else {
        return this.viewRenderer.renderPartial(
          this,
          { partial: options as RenderOptions["partial"], locals },
          block,
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

Object.defineProperty(Base.prototype, "yield", {
  get(this: Base): SafeBuffer | Promise<SafeBuffer> | null {
    return this._layoutFor();
  },
  enumerable: false,
  configurable: true,
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface Base
  extends Omit<Context, "_layoutFor">, Omit<HelperMethods, "logger">, TseUtilMethods {
  _layoutFor: (typeof HelperExports)["_layoutFor"];
  controller: Parameters<typeof assignController>[0];
  request: unknown;
  _backUrl: typeof _backUrl;
  _filteredReferrer: typeof _filteredReferrer;
  _objectForFormBuilder: typeof _objectForFormBuilder;
  /** @noRailsEquivalent PERMANENT */
  readonly yield: SafeBuffer;
}

include(Base, Context);
include(Base, TseUtil);
include(Base, Helpers);

runLoadHooks("action_view", Base);

ActionView.Base = Base;
