import { chomp, htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";
import { compileJs, type EmitJsOptions, type EmitResult } from "@blazetrails/tse-compiler";
import { Base } from "../../base.js";
import { TseRenderContextImpl, type TseRenderContext } from "../../render-context.js";
import { StrictLocalsMismatch } from "../../strict-locals.js";
import type { RenderContext, TemplateHandler } from "../handlers.js";
import {
  translateLocation as translateLocationImpl,
  type BacktraceLocation,
  type Spot,
} from "./tse-translate-location.js";

export {
  LocationParsingError,
  type BacktraceLocation,
  type Spot,
} from "./tse-translate-location.js";

/**
 * Minimal shape `Tse#call` needs from a template. Mirrors the subset of
 * Rails' `ActionView::Template` that `Handlers::ERB#call` touches:
 * `template.type` (MIME type) drives the `escape_ignore_list` check;
 * `template.format` and `template.shortIdentifier` drive annotation comments.
 */
export interface TseTemplate {
  type?: string | null;
  format?: string | null;
  shortIdentifier?: string | null;
}

/**
 * Pluggable compiler. Default is {@link compileJs} from
 * `@blazetrails/tse-compiler`. Rails analogue:
 * `Template::Handlers::ERB.erb_implementation` — swappable in tests and by
 * downstream apps that want a different emitter.
 */
export type TseImplementation = (source: string, options?: EmitJsOptions) => EmitResult;

/**
 * ActionView::Template::Handlers::Tse
 *
 * Trails Server Embedded handler — the `.tse` analogue of Rails'
 * `Template::Handlers::ERB`. Reads class-level options, derives per-template
 * compile options from `template.type`, delegates the actual
 * source → JS-code compile to `@blazetrails/tse-compiler` (the `erubi`
 * analogue), and returns the emitted JS module string.
 *
 * Mirrors `actionview/lib/action_view/template/handlers/erb.rb`.
 */
export class Tse implements TemplateHandler {
  readonly extensions = ["tse"];

  /**
   * Trim mode (Rails: `erb_trim_mode`). API-surface parity only — Rails wires
   * this through to Erubi, but `@blazetrails/tse-compiler` v0.1.0 hard-codes
   * `-` trimming (the only mode Rails ever passes). The attribute is exposed
   * now so downstream code that mirrors Rails patterns (`Tse.trimMode = "-"`)
   * doesn't crash; it becomes load-bearing once tse-compiler accepts a `trim`
   * option.
   */
  static trimMode: string = "-";

  /**
   * Template MIME types whose `<%= %>` should NOT HTML-escape. Defaults to
   * `["text/plain"]`. Rails: `escape_ignore_list`.
   */
  static escapeIgnoreList: string[] = ["text/plain"];

  /**
   * When true, `source.chomp` (drop a single trailing newline) is applied
   * before compile. Rails: `strip_trailing_newlines`, default `false`.
   */
  static stripTrailingNewlines: boolean = false;

  /**
   * Swappable compiler implementation. Rails analogue:
   * `erb_implementation = Erubi`.
   */
  static implementation: TseImplementation = compileJs;

  /**
   * Class-level convenience. Mirrors `Handlers::ERB.call` which does
   * `new.call(template, source)`. `Template::Handlers` registers the
   * class itself in Rails; calling `Tse.call(template, source)` matches
   * that protocol without forcing callers to construct an instance.
   */
  static call(template: TseTemplate, source: string): string {
    return new this().call(template, source);
  }

  /** Mirrors `Template::Handlers::ERB#supports_streaming?` — instance
   *  method, per Rails. */
  supportsStreaming(): boolean {
    return true;
  }

  /** Mirrors `Template::Handlers::ERB#handles_encoding?` — instance method. */
  handlesEncoding(): boolean {
    return true;
  }

  /**
   * Translate a `ErrorHighlight`-shaped spot back to a source-line/column
   * inside the `.tse` template. Mirrors
   * `Template::Handlers::ERB#translate_location(spot, backtrace_location, source)`
   * 1:1 — the algorithm is delegated to {@link translateLocationImpl}, which
   * ports `find_offset` / `offset_source_tokens` from `erb.rb`. Returns the
   * mutated spot on success, `null` if the line is past EOF or the snippet
   * can't be anchored.
   */
  translateLocation(spot: Spot, backtraceLocation: BacktraceLocation, source: string): Spot | null {
    return translateLocationImpl(spot, backtraceLocation, source);
  }

  /**
   * Compile a template source to a JS module string. Rails:
   * `Handlers::ERB#call(template, source) → ruby_code_string`.
   *
   * Encoding-tag handling: Rails strips a leading magic `# encoding:` line
   * before passing source to Erubi. `.tse` source is JavaScript/TypeScript,
   * which has no encoding pragma (files are always UTF-8 by spec), so this
   * step is a documented no-op — there is nothing to strip.
   */
  call(template: TseTemplate, source: string): string {
    const ctor = this.constructor as typeof Tse;
    const prepared = ctor.stripTrailingNewlines ? chomp(source) : source;
    // Rails compares `template.type` (a MIME string like "text/html") against
    // `escape_ignore_list`. Trails' `Template#type` currently returns the
    // format token ("html") until `Mime::Type` lands — normalize both forms
    // here so the Rails-shape default `["text/plain"]` matches regardless.
    const mime = template.type != null ? formatToMimeType(template.type) : null;
    const escapeIgnore = mime != null && ctor.escapeIgnoreList.includes(mime);
    const options: EmitJsOptions = { escapeIgnore };
    // Rails erb.rb lines 86–89: annotate HTML output with BEGIN/END comments
    // when ActionView::Base.annotate_rendered_view_with_filenames is on.
    const format = template.format ?? (mime === "text/html" ? "html" : null);
    if (Base.annotateRenderedViewWithFilenames && format === "html" && template.shortIdentifier) {
      const id = template.shortIdentifier;
      options.preamble = `_ob.safeAppend(${JSON.stringify(`<!-- BEGIN ${id} -->`)});`;
      options.postamble = `_ob.safeAppend(${JSON.stringify(`<!-- END ${id} -->`)});`;
    }
    const result = ctor.implementation(prepared, options);
    return result.code;
  }

  /**
   * Compile the template and run it, returning its output.
   *
   * Rails splits this across `Template#compile!`
   * (`actionview/lib/action_view/template.rb:418`), which `module_eval`s the
   * handler's code string into a real method on the view class and memoizes on
   * `@compiled`, and `Template#render` (`template.rb:271`), which calls that
   * method and returns `OutputBuffer#to_s`. `new Function` is the JS analogue
   * of `module_eval` — it is the only way to turn an emitted source string into
   * a callable — and the compile is memoized on that source the way Rails
   * memoizes on `@compiled`.
   */
  render(source: string, locals: Record<string, unknown>, context: RenderContext): string {
    const compiled = this.compiled(source, context);
    const renderContext = new HandlerRenderContext(context);
    if (context.yield !== undefined) renderContext.setDefaultYield(htmlSafe(context.yield));
    compiled(renderContext, locals, scopeFor(renderContext, locals));
    return renderContext.outputBuffer.toStr();
  }

  /**
   * Memoized emitted-source → callable. Mirrors `compile!`'s `@compiled`
   * guard; keyed on the emitted code so a handler-option change
   * (`escapeIgnoreList`, annotation) compiles afresh.
   *
   * @internal
   */
  private compiled(source: string, context: RenderContext): CompiledTemplate {
    const code = this.call(
      { type: context.format, format: context.format, shortIdentifier: context.templatePath },
      source,
    );
    let fn = compiledCache.get(code);
    if (!fn) {
      fn = evaluateTemplate(code, context.templatePath);
      compiledCache.set(code, fn);
    }
    return fn;
  }
}

/**
 * Build the object a compiled template's bare identifiers resolve against.
 *
 * Rails compiles a template into a method ON THE VIEW
 * (`template.rb:458-463`), so `yield`, `render`, `raw`, `concat`, `capture`
 * and `content_for` are all in scope as ordinary method calls, and
 * `locals_code` (`template.rb:561-572`) then assigns each local as a real
 * local variable — which is why a local shadows a same-named helper. The
 * object environment record below is the JS construct with that resolution
 * order: helpers first, locals assigned over them.
 *
 * `<%= yield %>` compiles to an identifier read rather than a call, so the
 * default section is a property; a named section is read off the context
 * (`context.yield("sidebar")`), which the compiler cannot spell as
 * `yield :sidebar`.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE helper-methods-not-in-tse-scope
 */
function scopeFor(
  context: HandlerRenderContext,
  locals: Record<string, unknown>,
): Record<string, unknown> {
  const scope: Record<string, unknown> = {
    render: (options: Parameters<TseRenderContext["render"]>[0]) => context.render(options),
    raw: (value: unknown) => context.raw(value),
    concat: (value: unknown) => context.concat(value),
    capture: (callback: () => void) => context.capture(callback),
    contentFor: (name: string, callback: () => void) => context.contentFor(name, callback),
  };
  Object.defineProperty(scope, "yield", {
    get: () => context.yield(),
    enumerable: true,
  });
  return Object.assign(scope, locals);
}

/** The shape `compileJs` emits as its default export, plus the scope record. @internal */
type CompiledTemplate = (
  context: TseRenderContext,
  locals: Record<string, unknown>,
  scope: Record<string, unknown>,
) => unknown;

const compiledCache = new Map<string, CompiledTemplate>();

/**
 * Turn the emitted ES-module source into a callable. The compiler emits
 * `export default function render(context, locals)`, optionally preceded by an
 * `import` of `StrictLocalsMismatch`; strip both so the remainder is a
 * function expression, then create it inside a `with` block over the scope
 * record so its bare identifiers resolve there. The emitted name `render` is
 * renamed on the way: as a function *expression* it would bind inside the
 * function's own scope and shadow the `render` helper the scope record
 * supplies, so `<%= render({ partial: … }) %>` would recurse into the
 * template.
 *
 * `locals` is passed through unchanged — the strict-locals check the compiler
 * emits compares `Object.keys(locals)` against the declared signature, so the
 * scope record must not stand in for it.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE helper-methods-not-in-tse-scope
 */
function evaluateTemplate(code: string, templatePath?: string): CompiledTemplate {
  const expression = code
    .replace(/^import\s+\{[^}]*\}\s+from\s+"[^"]*";\n?/u, "")
    .replace(/^\s*export\s+default\s+/u, "")
    .replace(/^function\s+render\b/u, "function __tseCompiled");
  try {
    const factory = new Function(
      "StrictLocalsMismatch",
      "__tseContext",
      "__tseLocals",
      "__tseScope",
      `with (__tseScope) { var __tseTemplate = ${expression}; return __tseTemplate(__tseContext, __tseLocals); }`,
    ) as (
      mismatch: typeof StrictLocalsMismatch,
      context: TseRenderContext,
      locals: Record<string, unknown>,
      scope: Record<string, unknown>,
    ) => unknown;
    return (context, locals, scope) => factory(StrictLocalsMismatch, context, locals, scope);
  } catch (error) {
    const where = templatePath != null ? ` (${templatePath})` : "";
    throw new SyntaxError(`Failed to compile .tse template${where}: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

/**
 * The per-render view object a compiled template is run against. Rails passes
 * the `ActionView::Base` instance, which answers `render` for a nested
 * partial; trails threads that capability in through
 * {@link RenderContext.renderPartial}, so the handler needs no `LookupContext`.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE helper-methods-not-in-tse-scope
 */
class HandlerRenderContext extends TseRenderContextImpl {
  constructor(private readonly context: RenderContext) {
    super();
  }

  protected override _renderPartial(
    partial: string,
    _localName: string,
    locals: Record<string, unknown>,
  ): SafeBuffer {
    const render = this.context.renderPartial;
    if (!render) {
      throw new Error(
        `Cannot render partial ${JSON.stringify(partial)} — this render context has no ` +
          "partial renderer. Render through LookupContext so nested partials resolve.",
      );
    }
    return htmlSafe(render(partial, locals));
  }
}

/**
 * Normalize a `template.type` input into a MIME string. Rails compares the
 * `escape_ignore_list` (default `["text/plain"]`) against `Template#type`,
 * which already returns a MIME string. Trails' `Template#type` currently
 * returns the format token (e.g. `"html"`) until `Mime::Type` lands, so we
 * widen the input here: pass-through for MIMEs, map known tokens to MIME.
 * Unknown tokens pass through unchanged so they still miss the ignore list.
 *
 * @internal
 */
function formatToMimeType(format: string): string {
  switch (format) {
    case "html":
      return "text/html";
    case "text":
      return "text/plain";
    case "json":
      return "application/json";
    case "xml":
      return "application/xml";
    case "js":
      return "text/javascript";
    case "css":
      return "text/css";
    default:
      return format;
  }
}
