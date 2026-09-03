import {
  h,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  InheritableOptions,
  jsonEscape,
  runLoadHooks,
  xmlNameEscape,
  type SafeBuffer,
} from "@blazetrails/activesupport";

import { _setBase } from "./base-slot.js";
import { OutputBuffer } from "./buffers.js";
import { OutputFlow } from "./flows.js";
import * as Helpers from "./helpers/index.js";
import { LookupContext } from "./lookup-context.js";
import type { Template } from "./template.js";
import type { RenderOptions } from "./renderer/abstract-renderer.js";
import { ArgumentError } from "@blazetrails/ruby-compat";

export type CompiledMethod = (
  this: Base,
  localAssigns: Record<string, unknown>,
  outputBuffer: OutputBuffer,
) => unknown;

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

  static defaultFormats: string[] = ["html", "text", "js", "css", "xml", "json"];

  static annotateRenderedViewWithFilenames: boolean = false;

  static prefixPartialPathWithControllerNamespace: boolean = true;

  static automaticallyDisableSubmitTag: boolean = true;

  static fieldErrorProc: (htmlTag: unknown, instance: unknown) => unknown = (htmlTag) =>
    Helpers.contentTag("div", htmlTag, { class: "field_with_errors" });

  static _routes: unknown = null;

  static logger: unknown = null;

  static _compiledMethods: Map<string, CompiledMethod> = new Map();

  static xssSafeQ(): boolean {
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

  static changedQ(other: typeof Base): boolean {
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

  lookupContext: LookupContext | null;

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

  outputBuffer: OutputBuffer | null = null;

  viewFlow: OutputFlow = new OutputFlow();

  virtualPath: string | null = null;

  /** @noRailsEquivalent PERMANENT */
  currentTemplate: Template | null = null;

  _controller: Parameters<typeof Helpers.assignController>[0] = null;

  _request: unknown = null;

  _config: unknown = null;

  _defaultFormBuilder: unknown = null;

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
    this.lookupContext = lookupContext;
    this.currentTemplate = null;
    this.assignController(controller as Parameters<typeof Helpers.assignController>[0]);
    this._prepareContext();
    this.assign(assigns);
  }

  assign(newAssigns: Record<string, unknown>): void {
    this._assigns = newAssigns;
    for (const [key, value] of Object.entries(newAssigns)) {
      (this as unknown as Record<string, unknown>)[key] = value;
    }
  }

  _prepareContext(): void {
    this.viewFlow = new OutputFlow();
    this.outputBuffer = new OutputBuffer();
    this.virtualPath = null;
  }

  _layoutFor(name?: string): SafeBuffer {
    return htmlSafe(this.viewFlow.get(name ?? "layout").toString());
  }

  compiledMethodContainer(): CompiledMethodContainer {
    return (this.constructor as typeof Base).compiledMethodContainer();
  }

  /** @missingRailsArgs _run — CONVERGEABLE template-render-hands-the-view-to-run */
  _run(
    method: string,
    template: Template | null,
    locals: Record<string, unknown>,
    buffer: OutputBuffer,
    options: { addToStack?: boolean } = {},
  ): unknown {
    const compiled = this.compiledMethodContainer()._compiledMethods.get(method);
    if (!compiled) throw new Error(`undefined method '${method}'`);
    const addToStack = options.addToStack ?? true;
    const oldOutputBuffer = this.outputBuffer;
    const oldVirtualPath = this.virtualPath;
    const oldTemplate = this.currentTemplate;
    if (addToStack) this.currentTemplate = template;
    this.outputBuffer = buffer;
    try {
      return compiled.call(this, locals, buffer);
    } finally {
      this.outputBuffer = oldOutputBuffer;
      this.virtualPath = oldVirtualPath;
      this.currentTemplate = oldTemplate;
    }
  }

  /**
   * @missingRailsCall view_renderer.render — PERMANENT
   * @missingRailsCall view_renderer.render_partial — PERMANENT
   */
  render(
    options: RenderOptions | string = {},
    locals: Record<string, unknown> = {},
    block?: () => unknown,
  ): SafeBuffer {
    const lookupContext = this.lookupContext;
    if (!lookupContext) {
      throw new Error(
        `Cannot render ${JSON.stringify(options)} — this view has no ` +
          "lookup context. Render through LookupContext so nested partials resolve.",
      );
    }
    const prefix = this.virtualPathPrefix();
    const viewFormat = this.currentFormat();

    if ((options as object | null)?.constructor !== Object) {
      return htmlSafe(
        lookupContext.renderPartialSync(String(options), prefix, viewFormat, { ...locals }, this),
      );
    }

    const hash = options as RenderOptions;
    return this.inRenderingContext(hash, (renderer) => {
      const format = hash.formats ? String([...renderer.formats][0] ?? viewFormat) : viewFormat;
      if (block) {
        this.viewFlow.set("layout", String(block() ?? ""));
        return htmlSafe(
          renderer.renderPartialSync(
            String(hash.layout),
            prefix,
            format,
            { ...(hash.locals ?? {}) },
            this,
          ),
        );
      }
      if (Object.hasOwn(hash, "partial")) {
        return htmlSafe(
          renderer.renderPartialSync(
            String(hash.partial),
            prefix,
            format,
            { ...(hash.locals ?? {}) },
            this,
          ),
        );
      }
      if (Object.hasOwn(hash, "body")) return htmlSafe(String(hash.body ?? ""));
      if (Object.hasOwn(hash, "plain")) return htmlSafe(String(hash.plain ?? ""));
      if (Object.hasOwn(hash, "html")) return htmlEscape(hash.html ?? "");
      if (Object.hasOwn(hash, "file") || Object.hasOwn(hash, "inline")) {
        throw new Error(
          `render ${Object.hasOwn(hash, "file") ? "file:" : "inline:"} is not available on the ` +
            "synchronous view path; render it through the controller.",
        );
      }
      if (Object.hasOwn(hash, "renderable")) {
        const renderable = hash.renderable as { renderIn(context: unknown): string };
        return htmlSafe(renderable.renderIn(this));
      }
      if (Object.hasOwn(hash, "template")) {
        return htmlSafe(
          renderer.renderTemplateSync(
            String(hash.template),
            prefix,
            format,
            { ...(hash.locals ?? {}) },
            this,
          ),
        );
      }
      throw new ArgumentError(
        "You invoked render but did not give any of :body, :file, :html, :inline, " +
          ":partial, :plain, :renderable, or :template option.",
      );
    });
  }

  /** @missingRailsCall new — PERMANENT */
  inRenderingContext<T>(options: RenderOptions, block: (renderer: LookupContext) => T): T {
    const oldLookupContext = this.lookupContext;

    if (!this.lookupContext?.htmlFallbackForJs && options.formats) {
      const formats = Array.isArray(options.formats) ? [...options.formats] : [options.formats];
      if (formats.length === 1 && formats[0] === "js") {
        formats.push("html");
      }
      this.lookupContext = this.lookupContext!.withPrependedFormats(formats);
    }

    try {
      return block(this.lookupContext!);
    } finally {
      this.lookupContext = oldLookupContext;
    }
  }

  /** @internal */
  private virtualPathPrefix(): string {
    const path = this.virtualPath ?? "";
    const slash = path.lastIndexOf("/");
    return slash === -1 ? "" : path.slice(0, slash);
  }

  /** @internal */
  private currentFormat(): string {
    return this.currentTemplate?.format ?? "html";
  }
}

const TseUtil = { h, htmlEscape, htmlEscapeOnce, jsonEscape, xmlNameEscape };
for (const [name, value] of Object.entries(TseUtil)) {
  (Base.prototype as unknown as Record<string, unknown>)[name] = value;
}

Helpers.installControllerInternals(Base.prototype);
Helpers.installControllerDelegates(Base.prototype);

for (const [name, value] of Object.entries(Helpers)) {
  if (typeof value !== "function") continue;
  if (name[0] !== name[0]?.toLowerCase()) continue;
  (Base.prototype as unknown as Record<string, unknown>)[name] = value;
}

Object.defineProperty(Base.prototype, "yield", {
  get(this: Base): SafeBuffer {
    return this._layoutFor();
  },
  enumerable: false,
  configurable: true,
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface Base extends HelperMethods, TseUtilMethods {
  controller: Parameters<typeof Helpers.assignController>[0];
  request: unknown;
  /** @noRailsEquivalent PERMANENT */
  readonly yield: SafeBuffer;
}

runLoadHooks("action_view", Base);

_setBase(Base);
