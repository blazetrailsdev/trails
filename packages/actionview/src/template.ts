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

const VALID_LOCAL_NAME = /^(?![A-Z0-9])[\p{L}\p{N}_]+$/u;

let nextObjectId = 0;

export interface TemplateOptions {
  source: string;
  identifier: string;
  handler?: TemplateHandler | null;
  locals?: readonly string[];
  format?: string | null;
  variant?: string | null;
  virtualPath?: string | null;
  extension?: string;
  fullPath?: string;
  isLayout?: boolean;
  isPartial?: boolean;
}

export class Template {
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
  isLayout: boolean;
  readonly isPartial: boolean;

  private _source: string;
  private readonly _locals: readonly string[];
  private _strictLocals: string | null | typeof NONE = NONE;
  /** @internal */
  _strictLocalKeys: readonly string[] | null = null;
  private _shortIdentifier?: string;
  private _methodName?: string;
  private readonly _objectId = ++nextObjectId;
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

  get locals(): readonly string[] | null {
    return this.strictLocalsQ() ? null : this._locals;
  }

  get type(): string | null {
    return this.format;
  }

  get shortIdentifier(): string {
    return (this._shortIdentifier ??= this.identifier);
  }

  supportsStreaming(): boolean {
    const h = this.resolveHandler();
    return Boolean(
      h && (h as { supportsStreaming?: () => boolean }).supportsStreaming?.() === true,
    );
  }

  /**
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

  translateLocation(backtraceLocation: BacktraceLocation, spot: Spot): Spot {
    const handler = this.resolveHandler() as LocationTranslatingHandler | undefined;
    if (typeof handler?.translateLocation === "function") {
      return handler.translateLocation(spot, backtraceLocation, this.source) ?? spot;
    } else {
      return spot;
    }
  }

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

  strictLocalsQ(): boolean {
    return this.strictLocalsBang() != null;
  }

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

  /** @internal */
  private compileBang(view: Base): void {
    const mod = view.compiledMethodContainer();
    if (this._compiled === mod) return;

    this.compile(mod);

    this._compiled = mod;
  }

  /** @internal */
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

  /** @internal */
  private localsCode(): string {
    if (this.strictLocalsQ()) return "";

    let locals = this._locals.filter((l) => !JS_RESERVED_KEYWORDS.includes(l));

    locals = locals.filter((l) => VALID_LOCAL_NAME.test(l));

    return locals.reduce(
      (code, key) => `${code}${key} = localAssigns[${JSON.stringify(key)}]; ${key} = ${key};`,
      "",
    );
  }

  private identifierMethodName(): string {
    return this.shortIdentifier.replace(/[^a-z_]/g, "_");
  }

  /** @internal */
  private resolveHandler(): TemplateHandler | undefined {
    return this.handler ?? TemplateHandlers.handlerForExtension(this.extension);
  }
}

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
