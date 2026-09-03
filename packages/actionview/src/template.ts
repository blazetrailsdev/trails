/**
 * ActionView::Template — Rails mirror: `action_view/template.rb`.
 *
 * A single template file: source, handler, and metadata (identifier,
 * format, variant, locals). `compile!` turns the handler's code string into
 * a method on `view.compiled_method_container` and `render` runs it through
 * `view._run`, exactly as `template.rb:271-287,418-438` does.
 */
import { htmlSafe } from "@blazetrails/activesupport";
import type { Base, CompiledMethod, CompiledMethodContainer } from "./base.js";
import { OutputBuffer } from "./buffers.js";
import { StrictLocalsMismatch } from "./strict-locals.js";
import { SyntaxErrorInTemplate, TemplateError } from "./template/error.js";
import { TemplateHandlers, type TemplateHandler } from "./template/handlers.js";
import { Raw } from "./template/handlers/raw.js";
import { Tse } from "./template/handlers/tse.js";
import {
  sourceLines,
  type BacktraceLocation,
  type Spot,
} from "./template/handlers/tse-translate-location.js";

type LocationTranslatingHandler = TemplateHandler & {
  translateLocation?: (
    spot: Spot,
    backtraceLocation: BacktraceLocation,
    source: string,
  ) => Spot | null;
};

const STRICT_LOCALS_REGEX = /#\s+locals:\s+\((.*)\)/;
const VARIABLE_FROM_BASENAME = /^_?(.*?)(?:\.\w+)*$/;
const NONE = Symbol("Template::NONE");

/**
 * The JS spelling of `RUBY_RESERVED_KEYWORDS` (`template.rb:558`): names
 * `locals_code` must not emit an assignment for, because the assignment would
 * be a syntax error.
 */
const JS_RESERVED_KEYWORDS = [
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
];

/** `template.rb:568` — only locals with valid variable names get set directly. */
const VALID_LOCAL_NAME = /^(?![A-Z0-9])[\p{L}\p{N}_]+$/u;

/**
 * Stands in for Ruby's `__id__` in `method_name` (`template.rb:398`): a value
 * unique to this object for the life of the process.
 */
let nextObjectId = 0;

export interface TemplateOptions {
  source: string;
  identifier: string;
  handler?: TemplateHandler | null;
  locals?: readonly string[];
  format?: string | null;
  variant?: string | null;
  virtualPath?: string | null;
  /** File extension. Rails infers from `handler`; kept here for the
   * resolver's "I just read this file off disk" shortcut. */
  extension?: string;
  fullPath?: string;
  isLayout?: boolean;
  /** Defaults to `basename(virtualPath ?? identifier).startsWith("_")`. */
  isPartial?: boolean;
}

export class Template {
  // `extend Template::Handlers` (`template.rb:178`), whose `Handlers.extended`
  // hook (`template/handlers.rb:12-18`) seeds the registry. Rails registers
  // `:raw`, `:erb`, `:html`, `:builder` and `:ruby`; trails has `raw` and the
  // `.tse` analogue of `:erb`. `Html`, `Builder` and the `:ruby` lambda are
  // unported.
  static {
    TemplateHandlers.registerDefaultTemplateHandler("raw", new Raw());
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
  }

  static Error = TemplateError;

  readonly identifier: string;
  readonly handler: TemplateHandler | null;
  readonly variable: string | null;
  readonly format: string | null;
  readonly variant: string | null;
  readonly virtualPath: string | null;
  readonly extension: string;
  readonly fullPath?: string;
  /** Mutable so resolvers can flip a cached lookup without rebuilding. */
  isLayout: boolean;
  readonly isPartial: boolean;

  private _source: string;
  private readonly _locals: readonly string[];
  private _strictLocals: string | null | typeof NONE = NONE;
  /**
   * Mirrors `@strict_local_keys` (`template.rb:534-537`), which Rails derives
   * from the compiled method's kwarg parameters. A JS function has no keyword
   * parameters to read back, so this stays null and `render`'s
   * implicit-locals branch never fires — the same language shortcoming
   * {@link compiledSource} documents.
   *
   * @internal
   */
  _strictLocalKeys: readonly string[] | null = null;
  private _shortIdentifier?: string;
  private _methodName?: string;
  private readonly _objectId = ++nextObjectId;
  /**
   * Rails' `@compiled` (`template.rb:420`) is a boolean, because a template
   * object belongs to exactly one `compiled_method_container`. In trails a
   * resolver's template cache outlives the view-context class, so the memo
   * records WHICH container the method was defined on and recompiles for a
   * second one instead of handing `_run` an undefined method.
   */
  private _compiled: CompiledMethodContainer | null = null;

  constructor(opts: TemplateOptions) {
    this._source = opts.source;
    this.identifier = opts.identifier;
    this.handler = opts.handler ?? null;
    this._locals = opts.locals ?? [];
    this.virtualPath = opts.virtualPath ?? null;
    this.format = opts.format ?? null;
    this.variant = opts.variant ?? null;
    this.extension = opts.extension ?? "";
    this.fullPath = opts.fullPath;
    this.isLayout = opts.isLayout ?? false;
    this.isPartial =
      opts.isPartial ?? basename(this.virtualPath ?? this.identifier).startsWith("_");
    this.variable = deriveVariable(this.virtualPath);
  }

  get source(): string {
    return this._source;
  }

  /** Null when the template declares strict locals via the magic comment. */
  get locals(): readonly string[] | null {
    return this.strictLocalsQ() ? null : this._locals;
  }

  /** MIME-type token. Returns the format string until `Mime::Type` lands. */
  get type(): string | null {
    return this.format;
  }

  /** Path with the project-root prefix stripped (no-op until trails has
   * a project-root concept). */
  get shortIdentifier(): string {
    return (this._shortIdentifier ??= this.identifier);
  }

  /** Rails: `supports_streaming?` — true when the handler opts in. */
  supportsStreaming(): boolean {
    const h = this.resolveHandler();
    return Boolean(
      h && (h as { supportsStreaming?: () => boolean }).supportsStreaming?.() === true,
    );
  }

  /**
   * Mirrors `Template#spot(location)` (`template.rb:231-246`).
   *
   * Ruby resolves the backtrace location to an AST node id and hands the node
   * to `ErrorHighlight.spot`, which reports the exact sub-expression that
   * raised. V8 has no node ids and no ErrorHighlight: a `CallSite` carries a
   * line and a column into the compiled source and nothing finer, so the spot
   * spans from that column to the end of the compiled line.
   *
   * @missingRailsCall compile — PERMANENT
   * @missingRailsCall parse — PERMANENT
   */
  spot(location: BacktraceLocation): Spot | null {
    const scriptLines = sourceLines(this.compiledSource());
    const found = scriptLines[location.lineno - 1];
    if (found === undefined) return null;

    return {
      snippet: found,
      firstLineno: location.lineno,
      lastLineno: location.lineno,
      firstColumn: (location.column ?? 1) - 1,
      lastColumn: found.replace(/\n$/, "").length,
      scriptLines,
    };
  }

  /**
   * Translate an error location returned by ErrorHighlight to the correct
   * source location inside the template. Mirrors
   * `Template#translate_location` (`template.rb:250-256`).
   *
   * `encode!` (`template.rb:253`) has no analogue — a JS string is Unicode by
   * specification, so `source` is handed to the handler as-is, the same
   * reason `compiledSource` drops the call.
   */
  translateLocation(backtraceLocation: BacktraceLocation, spot: Spot): Spot {
    const handler = this.resolveHandler() as LocationTranslatingHandler | undefined;
    if (typeof handler?.translateLocation === "function") {
      return handler.translateLocation(spot, backtraceLocation, this.source) ?? spot;
    } else {
      return spot;
    }
  }

  /**
   * Rails: `Template#strict_locals!`. Lazily strips the
   * `<%# locals: (...) %>` magic comment, memoizes the signature, and
   * returns it. Returns null when the comment is absent.
   */
  strictLocalsBang(): string | null {
    if (this._strictLocals === NONE) {
      const m = STRICT_LOCALS_REGEX.exec(this._source);
      if (m) {
        this._source = this._source.replace(STRICT_LOCALS_REGEX, "");
        const sig = m[1].trim();
        this._strictLocals = sig === "" ? "**nil" : sig;
      } else {
        this._strictLocals = null;
      }
    }
    return this._strictLocals;
  }

  /** Rails: `Template#strict_locals?`. */
  strictLocalsQ(): boolean {
    return this.strictLocalsBang() != null;
  }

  /**
   * Mirrors `Template#render(view, locals, buffer, implicit_locals:, add_to_stack:)`
   * (`template.rb:271-287`): compile the template if it has not been compiled
   * yet, then run the compiled method against the view.
   *
   * The non-buffer arm coerces a non-`OutputBuffer` result where Rails returns
   * it as-is; the tse-compiled method always returns its buffer, so the two
   * differ only on a path no compiled method takes, and `null` there would
   * cascade through every renderer's `Promise<string>`.
   */
  render(
    view: Base,
    locals: Record<string, unknown> = {},
    buffer: OutputBuffer | null = null,
    {
      implicitLocals = [],
      addToStack = true,
    }: { implicitLocals?: readonly string[]; addToStack?: boolean } = {},
  ): string {
    try {
      this.compileBang(view);

      if (this.strictLocalsQ() && this._strictLocalKeys && implicitLocals.length > 0) {
        const localsToIgnore = implicitLocals.filter((l) => !this._strictLocalKeys!.includes(l));
        for (const key of localsToIgnore) delete locals[key];
      }

      if (buffer) {
        view._run(this.methodName(), this, locals, buffer, { addToStack });
        return "";
      } else {
        const result = view._run(this.methodName(), this, locals, new OutputBuffer(), {
          addToStack,
        });
        return result instanceof OutputBuffer ? result.toStr() : String(result ?? "");
      }
    } catch (e) {
      return this.handleRenderError(view, e);
    }
  }

  /** Mirrors `Template#method_name` (`template.rb:396-402`). */
  methodName(): string {
    return (this._methodName ??= `_${this.identifierMethodName()}__${stringHash(
      this.identifier,
    )}_${this._objectId}`.replace(/-/g, "_"));
  }

  inspect(): string {
    const locals = this._locals.length > 0 ? `[:${this._locals.join(", :")}]` : "[]";
    return `#<Template ${this.shortIdentifier} locals=${locals}>`;
  }

  toString(): string {
    return this.inspect();
  }

  /** Shallow copy with `isLayout = true`. Resolvers use this when a
   * cached lookup needs to be served as a layout wrapper. */
  asLayout(): Template {
    return new Template({
      source: this._source,
      identifier: this.identifier,
      handler: this.handler,
      locals: this._locals,
      format: this.format,
      variant: this.variant,
      virtualPath: this.virtualPath,
      extension: this.extension,
      fullPath: this.fullPath,
      isPartial: this.isPartial,
      isLayout: true,
    });
  }

  /**
   * Mirrors `Template#compile!(view)` (`template.rb:418-438`). Rails takes
   * `@compile_mutex` around the body so two threads never compile the same
   * template; JS has no concurrent execution to guard against, so the lock and
   * its second `@compiled` re-check have no analogue.
   *
   * @internal
   */
  private compileBang(view: Base): void {
    const mod = view.compiledMethodContainer();
    if (this._compiled === mod) return;

    this.compile(mod);

    this._compiled = mod;
  }

  /**
   * Mirrors `Template#compiled_source` (`template.rb:443-485`): wrap the
   * handler's code string in the method `compile` defines, with
   * `@virtual_path =` and `locals_code` prepended.
   *
   * Rails' `method_arguments` branch splats the strict-locals signature into
   * the method's parameter list; a JS function has no keyword parameters, so
   * the tse compiler emits the strict-locals check into the body and raises
   * `StrictLocalsMismatch` there — the same reason `Base#_run` does not accept
   * Rails' `has_strict_locals:`. That is also why the handler is handed the
   * source BEFORE `strict_locals!` strips the magic comment, inverting
   * `template.rb:444-446`: the compiler is what reads the signature.
   *
   * The nested `with` is the JS construct with Ruby's name resolution order:
   * the method is defined ON THE VIEW, so an unqualified name is a helper call
   * on `self`, and `locals_code`'s assignments shadow a same-named helper.
   * `encode!` (`template.rb:445`) has no analogue — a JS string is Unicode by
   * specification, so there is no encoding to force.
   *
   * @internal
   */
  private compiledSource(): string {
    const source = this.source;
    this.strictLocalsBang();
    const handler = this.resolveHandler();
    if (!handler) {
      throw new Error(
        `No template handler registered for ".${this.extension}". ` +
          `Register one with TemplateHandlers.registerTemplateHandler(ext, handler).`,
      );
    }
    const code = handler.call(this, source);

    return `function ${this.methodName()}(localAssigns, outputBuffer) {
  this.virtualPath = ${JSON.stringify(this.virtualPath)};
  with (this) { with (localAssigns) {${this.localsCode()}
    return ${code};
  } }
}`;
  }

  /**
   * Mirrors `Template#compile(mod)` (`template.rb:499-521`) — Rails
   * `module_eval`s `compiled_source` onto the container, which defines a real
   * method named `method_name`; the JS analogue evaluates the same source to a
   * function and stores it under that name. Rails' strict-locals parameter
   * audit has no analogue: the tse compiler emits the check into the template
   * body (see {@link compiledSource}), so there are no method parameters to
   * inspect — and so no `to_sentence`d list of offending parameter names to
   * put in a `StrictLocalsError`.
   *
   * @internal
   * @missingRailsCall to_sentence — PERMANENT
   */
  private compile(mod: CompiledMethodContainer): void {
    const compiledSource = this.compiledSource();
    let factory: (mismatch: typeof StrictLocalsMismatch, safe: typeof htmlSafe) => CompiledMethod;
    try {
      factory = new Function("StrictLocalsMismatch", "htmlSafe", `return ${compiledSource};`) as (
        mismatch: typeof StrictLocalsMismatch,
        safe: typeof htmlSafe,
      ) => CompiledMethod;
    } catch (error) {
      throw new SyntaxErrorInTemplate(this, this.source, error as Error);
    }

    mod._compiledMethods.set(this.methodName(), factory(StrictLocalsMismatch, htmlSafe));
  }

  /** Mirrors `Template#handle_render_error(view, e)` (`template.rb:549-556`). */
  private handleRenderError(view: Base, e: unknown): never {
    if (e instanceof TemplateError) {
      e.subTemplateOf(this);
      throw e;
    } else {
      throw new TemplateError({
        original: e instanceof Error ? e : new Error(String(e)),
        template: this,
      });
    }
  }

  /**
   * Mirrors `Template#locals_code` (`template.rb:561-572`). The assignments
   * run inside `with (localAssigns)`, so a declared local the caller omitted
   * resolves to `undefined` — Ruby's `nil` — rather than falling through to a
   * same-named view helper.
   *
   * @internal
   */
  private localsCode(): string {
    if (this.strictLocalsQ()) return "";

    let locals = this._locals.filter((l) => !JS_RESERVED_KEYWORDS.includes(l));

    locals = locals.filter((l) => VALID_LOCAL_NAME.test(l));

    return locals.reduce(
      (code, key) => `${code}${key} = localAssigns[${JSON.stringify(key)}]; ${key} = ${key};`,
      "",
    );
  }

  /** Mirrors `Template#identifier_method_name` (`template.rb:574-576`). */
  private identifierMethodName(): string {
    return this.shortIdentifier.replace(/[^a-z_]/g, "_");
  }

  /** @internal */
  private resolveHandler(): TemplateHandler | undefined {
    return this.handler ?? TemplateHandlers.handlerForExtension(this.extension);
  }
}

/**
 * Stands in for the `String#hash` of `template.rb:398`. MRI's is seeded
 * randomly per process, so there is no algorithm to mirror — only the property
 * `method_name` relies on: equal identifiers hash equally within one process.
 * FNV-1a is a deterministic stand-in with that property.
 */
function stringHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function deriveVariable(virtualPath: string | null): string | null {
  if (!virtualPath) return null;
  const base = virtualPath.endsWith("/") ? "" : basename(virtualPath);
  const m = VARIABLE_FROM_BASENAME.exec(base);
  return m?.[1] || null;
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}
