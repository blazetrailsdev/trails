import { htmlSafe, Notifications, pluralize, toSentence } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/ruby-compat";
import type { Base, CompiledMethod, CompiledMethodContainer } from "./base.js";
import { OutputBuffer } from "./buffers.js";
import { SyntaxErrorInTemplate, TemplateError } from "./template/error.js";
import { TemplateHandlers, type TemplateHandler } from "./template/handlers.js";
import { Html } from "./template/handlers/html.js";
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
    TemplateHandlers.registerTemplateHandler("html", new Html());
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
      return this.instrumentRenderTemplate<string>(() => {
        this.compileBang(view);

        if (this.strictLocalsQ() && this._strictLocalKeys && implicitLocals.length > 0) {
          const localsToIgnore = implicitLocals.filter((l) => !this._strictLocalKeys!.includes(l));
          for (const key of localsToIgnore) delete locals[key];
        }

        if (buffer) {
          view._run(this.methodName(), this, locals, buffer, {
            addToStack,
            hasStrictLocals: this.strictLocalsQ(),
          });
          return "";
        } else {
          const result = view._run(this.methodName(), this, locals, new OutputBuffer(), {
            addToStack,
            hasStrictLocals: this.strictLocalsQ(),
          });
          return result instanceof OutputBuffer ? result.toStr() : String(result ?? "");
        }
      });
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

    this.instrument<void>("!compile_template", () => {
      this.compile(mod);
    });

    this._compiled = mod;
  }

  /** @internal */
  private compiledSource(): string {
    const setStrictLocals = this.strictLocalsBang();
    const source = this.source;
    const handler = this.resolveHandler();
    if (!handler) {
      throw new Error(
        `No template handler registered for ".${this.extension}". ` +
          `Register one with TemplateHandlers.registerTemplateHandler(ext, handler).`,
      );
    }
    const code = handler.call(this, source);

    let methodArguments: string;
    if (setStrictLocals != null) {
      if (setStrictLocals.includes("&")) {
        methodArguments = `local_assigns, output_buffer, ${setStrictLocals}`;
      } else {
        methodArguments = `local_assigns, output_buffer, ${setStrictLocals}, &_`;
      }
    } else {
      methodArguments = "local_assigns, output_buffer, &_";
    }
    const parameters = methodParameters(methodArguments);
    const scope = setStrictLocals != null ? "__strictLocals" : "localAssigns";

    return `Object.assign(function ${this.methodName()}(localAssigns, outputBuffer, __kwargs = {}) {${setStrictLocals != null ? kwargsCode(parameters) : ""}
  this.virtualPath = ${JSON.stringify(this.virtualPath)};
  with (this) { with (${scope}) {${this.localsCode()}
    return ${code};
  } }
}, { parameters: ${JSON.stringify(parameters.map(([type, name]) => (name === undefined ? [type] : [type, name])))} })`;
  }

  /** @internal */
  protected compile(mod: CompiledMethodContainer): void {
    const compiledSource = this.compiledSource();
    let factory: (
      argumentError: typeof ArgumentError,
      safe: typeof htmlSafe,
      outputBuffer: typeof OutputBuffer,
    ) => CompiledMethod;
    try {
      factory = new Function(
        "ArgumentError",
        "htmlSafe",
        "OutputBuffer",
        `return ${compiledSource};`,
      ) as (
        argumentError: typeof ArgumentError,
        safe: typeof htmlSafe,
        outputBuffer: typeof OutputBuffer,
      ) => CompiledMethod;
    } catch (error) {
      throw new SyntaxErrorInTemplate(this, this.source, error as Error);
    }

    const method = factory(ArgumentError, htmlSafe, OutputBuffer);
    mod._compiledMethods.set(this.methodName(), method);

    if (!this.strictLocalsQ()) return;

    const parameters = method.parameters!.filter(
      ([type, name]) => !(type === "req" && (name === "local_assigns" || name === "output_buffer")),
    );

    const nonKwargParameters = parameters.filter(
      ([type]) => !["keyreq", "key", "keyrest", "nokey"].includes(type),
    );

    const last = nonKwargParameters.at(-1);
    if (last?.[0] === "block" && last[1] === "_") nonKwargParameters.pop();

    if (nonKwargParameters.length > 0) {
      mod._compiledMethods.delete(this.methodName());

      throw new ArgumentError(
        `${toSentence(nonKwargParameters.map(([, name]) => `\`${name}\``))} set as non-keyword ` +
          `${pluralize("argument", nonKwargParameters.length)} for ${this.shortIdentifier}. ` +
          "Locals can only be set as keyword arguments.",
      );
    }

    if (!parameters.some(([type]) => type === "keyrest")) {
      this._strictLocalKeys = Object.freeze(parameters.map((p) => p[p.length - 1]!).sort());
    }
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

  private instrument<T>(action: string, block: () => T): T {
    return Notifications.instrument<T>(
      `${action}.action_view`,
      this.instrumentPayload(),
      block,
    ) as T;
  }

  private instrumentRenderTemplate<T>(block: () => T): T {
    return Notifications.instrument<T>(
      "!render_template.action_view",
      this.instrumentPayload(),
      block,
    ) as T;
  }

  private instrumentPayload(): Record<string, unknown> {
    return { virtual_path: this.virtualPath, identifier: this.identifier };
  }

  /** @internal */
  private resolveHandler(): TemplateHandler | undefined {
    return this.handler ?? TemplateHandlers.handlerForExtension(this.extension);
  }
}

type Parameter = [type: string, name?: string, defaultExpr?: string];

function methodParameters(methodArguments: string): Parameter[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < methodArguments.length; i++) {
    const c = methodArguments[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      args.push(methodArguments.slice(start, i));
      start = i + 1;
    }
  }
  args.push(methodArguments.slice(start));

  return args
    .map((arg) => arg.trim())
    .filter((arg) => arg !== "")
    .map((arg): Parameter => {
      let m: RegExpExecArray | null;
      if ((m = /^&(\w*)$/.exec(arg))) return ["block", m[1] || "&"];
      if (arg === "**nil") return ["nokey"];
      if ((m = /^\*\*(\w*)$/.exec(arg))) return ["keyrest", m[1] || "**"];
      if ((m = /^\*(\w*)$/.exec(arg))) return ["rest", m[1] || "*"];
      if ((m = /^(\w+):\s*([\s\S]*)$/.exec(arg))) {
        return m[2] === "" ? ["keyreq", m[1]] : ["key", m[1], m[2]];
      }
      if ((m = /^(\w+)\s*=\s*([\s\S]+)$/.exec(arg))) return ["opt", m[1], m[2]];
      if (/^\w+$/.test(arg)) return ["req", arg];
      throw new SyntaxError(`invalid locals signature argument: ${arg}`);
    });
}

function kwargsCode(parameters: Parameter[]): string {
  const keyreq = parameters.filter(([type]) => type === "keyreq").map(([, name]) => name!);
  const keywords = parameters
    .filter(([type]) => type === "keyreq" || type === "key")
    .map(([, name]) => name!);
  const keyrest = parameters.find(([type]) => type === "keyrest");
  const lines: string[] = [];

  if (keyreq.length > 0) {
    lines.push(
      `const __missing = ${JSON.stringify(keyreq)}.filter((k) => !Object.hasOwn(__kwargs, k));`,
      'if (__missing.length > 0) throw new ArgumentError(`missing keyword${__missing.length > 1 ? "s" : ""}: ${__missing.map((k) => ":" + k).join(", ")}`);',
    );
  }
  if (parameters.some(([type]) => type === "nokey")) {
    lines.push(
      'if (Object.keys(__kwargs).length > 0) throw new ArgumentError("no keywords accepted");',
    );
  } else if (!keyrest) {
    lines.push(
      `const __unknown = Object.keys(__kwargs).filter((k) => !${JSON.stringify(keywords)}.includes(k));`,
      'if (__unknown.length > 0) throw new ArgumentError(`unknown keyword${__unknown.length > 1 ? "s" : ""}: ${__unknown.map((k) => ":" + k).join(", ")}`);',
    );
  }

  lines.push("const __strictLocals = {};");
  for (const [type, name, defaultExpr] of parameters) {
    const key = JSON.stringify(name);
    if (type === "keyreq") lines.push(`__strictLocals[${key}] = __kwargs[${key}];`);
    if (type === "key") {
      lines.push(
        `__strictLocals[${key}] = Object.hasOwn(__kwargs, ${key}) ? __kwargs[${key}] : (${defaultExpr});`,
      );
    }
  }
  if (keyrest && keyrest[1] !== "**") {
    lines.push(
      `__strictLocals[${JSON.stringify(keyrest[1])}] = Object.fromEntries(Object.entries(__kwargs).filter(([k]) => !${JSON.stringify(keywords)}.includes(k)));`,
    );
  }

  return lines.map((line) => `\n  ${line}`).join("");
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
