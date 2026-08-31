import {
  h,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  InheritableOptions,
  jsonEscape,
  xmlNameEscape,
  type SafeBuffer,
} from "@blazetrails/activesupport";

import { OutputBuffer } from "./buffers.js";
import { OutputFlow } from "./flows.js";
import * as Helpers from "./helpers/index.js";
import { LookupContext } from "./lookup-context.js";
import type { Template } from "./template.js";

/**
 * The compiled form of one template: the function `Template#compile!` defines
 * on a {@link Base} subclass. Rails defines a real method, so `self` is the
 * view; the JS analogue is a function invoked with the view as `this`.
 */
export type CompiledMethod = (
  this: Base,
  localAssigns: Record<string, unknown>,
  outputBuffer: OutputBuffer,
) => unknown;

/**
 * A class that owns compiled template methods. Mirrors
 * `Base#compiled_method_container` — the module Rails `module_eval`s a
 * template's method into, which is a per-cache subclass so two caches never
 * share compiled methods.
 */
export interface CompiledMethodContainer {
  _compiledMethods: Map<string, CompiledMethod>;
}

/**
 * The instance-method half of `ActionView::Helpers` — every lowercase-initial
 * function the helper modules export, which `include Helpers` puts on the view.
 */
type HelperMethods = {
  [K in keyof typeof Helpers as (typeof Helpers)[K] extends (...args: never) => unknown
    ? K extends Capitalize<string & K>
      ? never
      : K
    : never]: (typeof Helpers)[K];
};

/** The `::ERB::Util` members `include`d onto the view (base.rb:158). */
interface TseUtilMethods {
  h: typeof h;
  htmlEscape: typeof htmlEscape;
  htmlEscapeOnce: typeof htmlEscapeOnce;
  jsonEscape: typeof jsonEscape;
  xmlNameEscape: typeof xmlNameEscape;
}

/**
 * ActionView::Base
 *
 * The view object a template is compiled into and rendered against. Mirrors
 * `actionview/lib/action_view/base.rb:157`; the `Context` module
 * (`action_view/context.rb`) is folded in at its Rails names, per the module
 * mixin rules in CLAUDE.md.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Helpers, Context` (base.rb:158); the class/interface merge is how a mixin surfaces on the type side.
export class Base {
  /** Mirrors `cattr_accessor :streaming_completion_on_exception` (base.rb:165). */
  static streamingCompletionOnException = `"><script>window.location = "/500.html"</script></html>`;

  /** Mirrors `cattr_accessor :default_formats` (base.rb:174). */
  static defaultFormats: string[] = ["html", "text", "js", "css", "xml", "json"];

  /**
   * When true, HTML responses are wrapped with `<!-- BEGIN/END <identifier> -->`
   * comments so browser DevTools show which template rendered each region.
   * Rails: `ActionView::Base.annotate_rendered_view_with_filenames`
   * (base.rb:179).
   */
  static annotateRenderedViewWithFilenames: boolean = false;

  /**
   * Mirrors `class_attribute :prefix_partial_path_with_controller_namespace`
   * (base.rb:170).
   */
  static prefixPartialPathWithControllerNamespace: boolean = true;

  /** Mirrors `cattr_accessor :automatically_disable_submit_tag` (base.rb:176). */
  static automaticallyDisableSubmitTag: boolean = true;

  /** Mirrors `cattr_accessor :field_error_proc` (base.rb:161). */
  static fieldErrorProc: (htmlTag: unknown, instance: unknown) => unknown = (htmlTag) =>
    Helpers.contentTag("div", htmlTag, { class: "field_with_errors" });

  /** Mirrors `class_attribute :_routes` (base.rb:182). */
  static _routes: unknown = null;

  /** Mirrors `class_attribute :logger` (base.rb:183). */
  static logger: unknown = null;

  /** Compiled template methods owned by this class. See {@link CompiledMethodContainer}. */
  static _compiledMethods: Map<string, CompiledMethod> = new Map();

  /** Mirrors `Base.xss_safe?` (base.rb:195). */
  static xssSafeQ(): boolean {
    return true;
  }

  /**
   * Mirrors `Base.with_empty_template_cache` (base.rb:198-210) — an anonymous
   * subclass that answers itself as `compiledMethodContainer`, so subclasses
   * never share a superclass's compiled methods.
   */
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

  /**
   * The singleton half of the pair `with_empty_template_cache` defines
   * (`base.rb:202`, `define_singleton_method(:compiled_method_container)`).
   *
   * Rails' `Base` has no class-level reader at all — calling it there is a
   * `NoMethodError`. TypeScript cannot type a call to a static that only some
   * subclasses define, so the member is declared here and throws, which is the
   * same outcome by the only spelling the language allows. The name itself is
   * Rails' (`base.rb:284`), so it is not extra surface and carries no receipt.
   */
  static compiledMethodContainer(): CompiledMethodContainer {
    throw new Error(
      "Subclasses of ActionView::Base must implement `compiledMethodContainer` " +
        "or use the class method `withEmptyTemplateCache` for constructing " +
        "an ActionView::Base subclass that has an empty cache.",
    );
  }

  /** Mirrors `Base.changed?(other)` (base.rb:212-214). */
  static changedQ(other: typeof Base): boolean {
    return this.compiledMethodContainer() !== other.compiledMethodContainer();
  }

  /**
   * Mirrors the `Class.new(klass) { include helpers }` arm of
   * `Rendering::ClassMethods#build_view_context_class`
   * (`actionview/lib/action_view/rendering.rb:59-73`) — the subclass a
   * controller renders through, carrying its `_helpers` module so
   * `helper_method :current_user` is an ordinary method on the view.
   *
   * The module is a prototype-chained plain object, so the copy walks the
   * chain the way Ruby's `include` walks ancestors.
   *
   * Rails puts this on the controller, memoized, and includes the route
   * helpers alongside; only the `include helpers` arm lands here.
   *
   * @noRailsEquivalent CONVERGEABLE port-view-context-class-on-controller
   */
  static withHelpers(helpers: object | null | undefined): typeof Base {
    // Rails builds on `DetailsKey.view_context_class` (rendering.rb:53), which
    // is itself a `with_empty_template_cache` subclass.
    const base = this.withEmptyTemplateCache();
    // `Class.new(klass) do ... end` (rendering.rb:64) always builds the
    // subclass; the `if helpers` guard is inside it.
    const subclass = class extends base {};
    if (!helpers) return subclass;
    // Ruby's `include` brings every member, accessors included, and walks the
    // module's ancestors; a descriptor copy up the prototype chain is the JS
    // equivalent. A plain `for…in` value read would flatten a getter.
    for (let mod: object | null = helpers; mod && mod !== Object.prototype; ) {
      for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(mod))) {
        if (name === "constructor") continue;
        if (!Object.hasOwn(subclass.prototype, name)) {
          Object.defineProperty(subclass.prototype, name, descriptor);
        }
      }
      mod = Object.getPrototypeOf(mod) as object | null;
    }
    return subclass;
  }

  /** Mirrors `Base.empty` (base.rb:229-231). */
  static empty(): Base {
    return this.withViewPaths([]);
  }

  /** Mirrors `Base.with_view_paths(view_paths, assigns, controller)` (base.rb:233-235). */
  static withViewPaths(
    viewPaths: ConstructorParameters<typeof LookupContext>[0],
    assigns: Record<string, unknown> = {},
    controller: unknown = null,
  ): Base {
    return this.withContext(new LookupContext(viewPaths), assigns, controller);
  }

  /** Mirrors `Base.with_context(context, assigns, controller)` (base.rb:237-239). */
  static withContext(
    context: LookupContext | null,
    assigns: Record<string, unknown> = {},
    controller: unknown = null,
  ): Base {
    return new this(context, assigns, controller);
  }

  /** `attr_reader :lookup_context` (base.rb:217). */
  readonly lookupContext: LookupContext | null;

  /** `delegate :formats, to: :lookup_context` (base.rb:221). */
  get formats(): LookupContext["formats"] | undefined {
    return this.lookupContext?.formats;
  }

  /** `delegate :formats=, to: :lookup_context` (base.rb:221). */
  set formats(values: LookupContext["formats"]) {
    if (this.lookupContext) this.lookupContext.formats = values;
  }

  /** `delegate :locale, to: :lookup_context` (base.rb:221). */
  get locale(): LookupContext["locale"] | undefined {
    return this.lookupContext?.locale;
  }

  /** `delegate :locale=, to: :lookup_context` (base.rb:221). */
  set locale(value: LookupContext["locale"]) {
    if (this.lookupContext) this.lookupContext.locale = value;
  }

  /**
   * `delegate :view_paths, to: :lookup_context` (base.rb:221).
   *
   * The `:view_paths=` half of that same `delegate` has no target: `LookupContext`
   * declares `attr_reader :view_paths` (`lookup_context.rb:126`) and reassigns
   * `@view_paths` only from `append_view_paths` / `prepend_view_paths`
   * (`:155-161`); the `view_paths=` writer lives on the controller-side
   * `ActionView::ViewPaths` (`view_paths.rb:68`). So `view.view_paths = …`
   * raises `NoMethodError` in Rails, and leaving this getter-only makes the
   * assignment a `TypeError` here — the same outcome, from the language rather
   * than from an added guard.
   */
  get viewPaths(): LookupContext["viewPaths"] | undefined {
    return this.lookupContext?.viewPaths;
  }

  /** `attr_internal :assigns` (base.rb:218). */
  _assigns: Record<string, unknown> = {};

  /** `attr_accessor :output_buffer` — from `Context` (context.rb:15). */
  outputBuffer: OutputBuffer | null = null;

  /** `attr_accessor :view_flow` — from `Context` (context.rb:15). */
  viewFlow: OutputFlow = new OutputFlow();

  /** `@virtual_path` (context.rb:21). */
  virtualPath: string | null = null;

  /**
   * `@current_template` (base.rb:252). Ruby reads and writes it as an instance
   * variable, which TypeScript has no separate concept for — a field is the
   * only spelling, so it scores as surface Rails does not expose.
   *
   * @noRailsEquivalent PERMANENT
   */
  currentTemplate: Template | null = null;

  /** `attr_internal :controller` — `ControllerHelper` (controller_helper.rb:12). */
  _controller: Parameters<typeof Helpers.assignController>[0] = null;

  /** `attr_internal :request` — `ControllerHelper` (controller_helper.rb:12). */
  _request: unknown = null;

  /** `attr_internal :config` (base.rb:218). */
  _config: unknown = null;

  /** `@_default_form_builder`, set by `assign_controller` (controller_helper.rb:25). */
  _defaultFormBuilder: unknown = null;

  /**
   * `attr_internal :assigns` (base.rb:219) — the accessor pair
   * `attr_internal_define` leaves behind over the `@_assigns` ivar.
   */
  get assigns(): Record<string, unknown> {
    return this._assigns;
  }

  set assigns(value: Record<string, unknown>) {
    this._assigns = value;
  }

  /** `attr_internal :config` (base.rb:219). */
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
    // `@_config = ActiveSupport::InheritableOptions.new` (base.rb:245), set
    // before `assign_controller`, whose nil arm is `@_config ||= nil`.
    this._config = new InheritableOptions();
    this.lookupContext = lookupContext;
    this.currentTemplate = null;
    this.assignController(controller as Parameters<typeof Helpers.assignController>[0]);
    this._prepareContext();
    // Rails assigns last, to minimize the number of shapes (base.rb:259).
    this.assign(assigns);
  }

  /**
   * Mirrors `Base#assign(new_assigns)` (base.rb:221-224).
   *
   * Rails writes each key as an instance variable, a namespace disjoint from
   * the method table, so `assigns[:raw]` can never shadow the `raw` helper.
   * TypeScript has no separate ivar space — a field is the only spelling, the
   * same call taken for `currentTemplate` — so an assign named after a helper
   * does shadow it inside a template.
   */
  assign(newAssigns: Record<string, unknown>): void {
    this._assigns = newAssigns;
    for (const [key, value] of Object.entries(newAssigns)) {
      (this as unknown as Record<string, unknown>)[key] = value;
    }
  }

  /** Mirrors `Context#_prepare_context` (context.rb:18-22). */
  _prepareContext(): void {
    this.viewFlow = new OutputFlow();
    this.outputBuffer = new OutputBuffer();
    this.virtualPath = null;
  }

  /** Mirrors `Context#_layout_for(name)` (context.rb:27-30). */
  _layoutFor(name?: string): SafeBuffer {
    return htmlSafe(this.viewFlow.get(name ?? "layout").toString());
  }

  /** Mirrors `Base#compiled_method_container` (base.rb:284-290). */
  compiledMethodContainer(): CompiledMethodContainer {
    return (this.constructor as typeof Base).compiledMethodContainer();
  }

  /**
   * Mirrors `Base#_run(method, template, locals, buffer)` (base.rb:262-282):
   * swap in the buffer and current template, invoke the compiled method with
   * the view as `self`, and restore in an ensure.
   *
   * Rails' `has_strict_locals:` arm splats the locals as kwargs and converts
   * the resulting `ArgumentError` into a `StrictLocalsError`. The tse compiler
   * emits the strict-locals check into the template body itself, raising
   * `StrictLocalsMismatch` there, so there is no `ArgumentError` to convert and
   * the kwarg is not accepted.
   *
   * @missingRailsArgs _run — CONVERGEABLE template-render-takes-view-before-locals
   */
  _run(
    method: CompiledMethod,
    template: Template | null,
    locals: Record<string, unknown>,
    buffer: OutputBuffer,
    options: { addToStack?: boolean } = {},
  ): unknown {
    const addToStack = options.addToStack ?? true;
    const oldOutputBuffer = this.outputBuffer;
    const oldVirtualPath = this.virtualPath;
    const oldTemplate = this.currentTemplate;
    if (addToStack) this.currentTemplate = template;
    this.outputBuffer = buffer;
    try {
      return method.call(this, locals, buffer);
    } finally {
      this.outputBuffer = oldOutputBuffer;
      this.virtualPath = oldVirtualPath;
      this.currentTemplate = oldTemplate;
    }
  }

  /**
   * Mirrors `Helpers::RenderingHelper#render(options, locals, &block)`
   * (`actionview/lib/action_view/helpers/rendering_helper.rb:31`), which
   * hands the view itself to the renderer: `view_renderer.render(self, options)`.
   *
   * trails' `Renderer#render` is async where Rails' is synchronous, and a
   * compiled template method is synchronous, so this reaches the lookup
   * context's synchronous partial path instead.
   *
   * @missingRailsCall view_renderer.render — CONVERGEABLE actionview-render-path-is-async-where-rails-is-sync
   */
  render(
    options: { partial: string; locals?: Record<string, unknown> },
    locals: Record<string, unknown> = {},
  ): SafeBuffer {
    const lookupContext = this.lookupContext;
    if (!lookupContext) {
      throw new Error(
        `Cannot render partial ${JSON.stringify(options.partial)} — this view has no ` +
          "lookup context. Render through LookupContext so nested partials resolve.",
      );
    }
    return htmlSafe(
      lookupContext.renderPartialSync(
        options.partial,
        this.virtualPathPrefix(),
        this.currentFormat(),
        { ...locals, ...(options.locals ?? {}) },
        this,
      ),
    );
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

/**
 * `include Helpers` (base.rb:158) — `ActionView::Helpers`
 * (`action_view/helpers.rb:42-66`) includes every helper module, so every
 * helper is an instance method on the view and a bare identifier in a
 * template resolves to it.
 *
 * Ruby's `include` brings a module's instance methods into the method table
 * and leaves its constants as constants. The trails helper modules are files
 * of exported functions, so the lowercase-initial function exports are the
 * instance methods; an uppercase-initial export (`FormBuilder`, `TagBuilder`)
 * is the spelling of a Ruby constant and stays off the prototype.
 */
// `include ::ERB::Util` (base.rb:158) — trails spells it `TSE::Util`, so
// `<%= h(name) %>` and `<%= jsonEscape(x) %>` resolve as bare identifiers the
// way they do on a Rails view.
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

// `<%= yield %>` in a Rails layout is the keyword, which calls the block
// `_run` was handed; ActionView's block answers `_layout_for(nil)`. A JS
// identifier read cannot call anything, so the value arrives through a getter.
// A named section keeps Rails' own method name, `_layoutFor("side")`.
Object.defineProperty(Base.prototype, "yield", {
  get(this: Base): SafeBuffer {
    return this._layoutFor();
  },
  enumerable: false,
  configurable: true,
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface Base extends HelperMethods, TseUtilMethods {
  /** `attr_internal :controller` (controller_helper.rb:12). */
  controller: Parameters<typeof Helpers.assignController>[0];
  /** `attr_internal :request` (controller_helper.rb:12). */
  request: unknown;
  /**
   * The value of a bare `<%= yield %>`. Rails' `yield` is a keyword, so no
   * Ruby method carries this name.
   *
   * @noRailsEquivalent PERMANENT
   */
  readonly yield: SafeBuffer;
}
