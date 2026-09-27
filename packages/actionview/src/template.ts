import {
  htmlSafe,
  Notifications,
  pluralize,
  SafeBuffer,
  toSentence,
} from "@blazetrails/activesupport";
import { ArgumentError, Encoding } from "@blazetrails/ruby-compat";
import type { Base, CompiledMethod, CompiledMethodContainer } from "./base.js";
import { OutputBuffer, StreamingBuffer } from "./buffers.js";
import { SyntaxErrorInTemplate, TemplateError, WrongEncodingError } from "./template/error.js";
import { TemplateHandlers, type TemplateHandler } from "./template/handlers.js";
import { Html } from "./template/handlers/html.js";
import { Raw } from "./template/handlers/raw.js";
import { Tse } from "./template/handlers/tse.js";
import { SimpleType } from "./template/types.js";
import type { File as SourcesFile } from "./template/sources/file.js";
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

type TypesImplementation = {
  symbols(): readonly string[];
  isValidSymbols(symbols: readonly unknown[]): boolean;
  get(type: string | null): { readonly symbol: string | null; toString(): string } | undefined;
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
  locals: readonly string[];
  format?: string | null;
  variant?: string | null;
  virtualPath?: string | null;
}

export class Template {
  static {
    TemplateHandlers.registerDefaultTemplateHandler("raw", new Raw());
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    TemplateHandlers.registerTemplateHandler("html", new Html());
    TemplateHandlers.registerTemplateHandler("ruby", {
      call: (_: unknown, source: string) => source,
    });
  }

  static Error = TemplateError;

  static Types: TypesImplementation = SimpleType;

  static set mimeTypesImplementation(implementation: TypesImplementation) {
    if (this.Types !== implementation) {
      this.Types = implementation;
    }
  }

  readonly identifier: string;
  readonly handler: TemplateHandler;
  readonly variable: string | null;
  readonly format: string | null;
  readonly variant: string | null;
  readonly virtualPath: string | null;

  private _source: string | SourcesFile;
  private readonly _locals: readonly string[];
  private _strictLocals: string | null | typeof NONE = NONE;
  /** @internal */
  _strictLocalKeys: readonly string[] | null = null;
  private _shortIdentifier?: string;
  private _type?: ReturnType<TypesImplementation["get"]>;
  private _methodName?: string;
  private readonly _objectId = ++nextObjectId;
  private _compiled = false;
  private _compiledStreaming = false;
  /** @internal */
  _streaming = false;

  constructor(
    source: string | SourcesFile,
    identifier: string,
    handler: TemplateHandler,
    { locals, format = null, variant = null, virtualPath = null }: TemplateOptions,
  ) {
    this._source = source;
    this.identifier = identifier;
    this.handler = handler;
    this._locals = locals;
    this.virtualPath = virtualPath;

    if (this.virtualPath) {
      const base = this.virtualPath.endsWith("/") ? "" : basename(this.virtualPath);
      this.variable = VARIABLE_FROM_BASENAME.exec(base)?.[1] || null;
    } else {
      this.variable = null;
    }

    this.format = format;
    this.variant = variant;
  }

  get source(): string {
    return this._source.toString();
  }

  get locals(): readonly string[] | null {
    return this.isStrictLocals() ? null : this._locals;
  }

  get type(): ReturnType<TypesImplementation["get"]> {
    return (this._type ??= Template.Types.get(this.format));
  }

  get shortIdentifier(): string {
    return (this._shortIdentifier ??= this.identifier);
  }

  supportsStreaming(): boolean {
    const handler = this.handler as { supportsStreaming?: () => boolean };
    return typeof handler.supportsStreaming === "function" && handler.supportsStreaming();
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
    const handler = this.handler as LocationTranslatingHandler;
    if (typeof handler.translateLocation === "function") {
      return handler.translateLocation(spot, backtraceLocation, this.source) ?? spot;
    } else {
      return spot;
    }
  }

  strictLocalsBang(): string | null {
    if (this._strictLocals === NONE) {
      const source = this.source;
      const m = STRICT_LOCALS_REGEX.exec(source);
      if (m) {
        if (typeof this._source === "string") {
          this._source = source.replace(STRICT_LOCALS_REGEX, "");
        }
        const sig = m[1].trim();
        this._strictLocals = sig === "" ? "**nil" : sig;
      } else {
        this._strictLocals = null;
      }
    }
    return this._strictLocals;
  }

  isStrictLocals(): boolean {
    return this.strictLocalsBang() != null;
  }

  render(
    view: Base,
    locals?: Record<string, unknown>,
    buffer?: null,
    options?: { implicitLocals?: readonly string[]; addToStack?: boolean },
    block?: (...name: unknown[]) => unknown,
  ): string;
  render(
    view: Base,
    locals: Record<string, unknown>,
    buffer: StreamingBuffer,
    options?: { implicitLocals?: readonly string[]; addToStack?: boolean },
    block?: (...name: unknown[]) => unknown,
  ): Promise<null>;
  render(
    view: Base,
    locals: Record<string, unknown>,
    buffer: OutputBuffer,
    options?: { implicitLocals?: readonly string[]; addToStack?: boolean },
    block?: (...name: unknown[]) => unknown,
  ): null;
  render(
    view: Base,
    locals: Record<string, unknown> = {},
    buffer: OutputBuffer | StreamingBuffer | null = null,
    {
      implicitLocals = [],
      addToStack = true,
    }: { implicitLocals?: readonly string[]; addToStack?: boolean } = {},
    block?: (...name: unknown[]) => unknown,
  ): string | null | Promise<null> {
    const streaming = buffer instanceof StreamingBuffer;
    try {
      const rendered = this.instrumentRenderTemplate<string | null | Promise<null>>(() => {
        this.compileBang(view, streaming);

        if (this.isStrictLocals() && this._strictLocalKeys && implicitLocals.length > 0) {
          const localsToIgnore = implicitLocals.filter((l) => !this._strictLocalKeys!.includes(l));
          for (const key of localsToIgnore) delete locals[key];
        }

        if (buffer) {
          const result = view._run(
            streaming ? this.streamingMethodName() : this.methodName(),
            this,
            locals,
            buffer as OutputBuffer,
            { addToStack, hasStrictLocals: this.isStrictLocals() },
            block,
          );
          return streaming ? (result as Promise<unknown>).then(() => null) : null;
        } else {
          const result = view._run(
            this.methodName(),
            this,
            locals,
            new OutputBuffer(),
            { addToStack, hasStrictLocals: this.isStrictLocals() },
            block,
          );
          return result instanceof OutputBuffer || result instanceof SafeBuffer
            ? result.toStr()
            : (result as string);
        }
      });
      return rendered instanceof Promise
        ? rendered.catch((e: unknown) => this.handleRenderError(view, e))
        : rendered;
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

  /**
   * @internal
   * @missingRailsArgs compile — PERMANENT
   */
  private compileBang(view: Base, streaming = false): void {
    if (streaming ? this._compiledStreaming : this._compiled) return;

    const mod = view.compiledMethodContainer();

    this.instrument<void>("!compile_template", () => {
      this.compile(mod, streaming);
    });

    if (streaming) this._compiledStreaming = true;
    else this._compiled = true;
  }

  /** @internal */
  private streamingMethodName(): string {
    return `${this.methodName()}_streaming`;
  }

  /** @internal */
  private compiledSource(streaming = false): string {
    const setStrictLocals = this.strictLocalsBang();
    let source = this.source;
    const handler = this.handler;
    let code: string;
    this._streaming = streaming;
    try {
      code = handler.call(this, source);
    } finally {
      this._streaming = false;
    }

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

    source = `Object.assign(${streaming ? "async " : ""}function ${streaming ? this.streamingMethodName() : this.methodName()}(localAssigns, outputBuffer, __kwargs = {}, _) {${setStrictLocals != null ? kwargsCode(parameters) : ""} this.virtualPath = ${JSON.stringify(this.virtualPath)}; const __yield = _ ? { get yield() { return _(); } } : {}; with (this) { with (__yield) { with (${scope}) {${this.localsCode()} ${code}
  } } }
}, { parameters: ${JSON.stringify(parameters.map(([type, name]) => (name === undefined ? [type] : [type, name])))} })`;

    if (/\p{Surrogate}/u.test(source)) {
      throw new WrongEncodingError(source, Encoding.defaultInternal);
    }

    return source;
  }

  /**
   * @internal
   * @missingRailsArgs compiled_source — PERMANENT
   */
  protected compile(mod: CompiledMethodContainer, streaming = false): void {
    const methodName = streaming ? this.streamingMethodName() : this.methodName();
    const compiledSource = this.compiledSource(streaming);
    let factory: (
      argumentError: typeof ArgumentError,
      safe: typeof htmlSafe,
      outputBuffer: typeof OutputBuffer,
    ) => CompiledMethod;
    try {
      factory = (0, eval)(
        `(function (ArgumentError, htmlSafe, OutputBuffer) { return ${compiledSource}; })\n//# sourceURL=${this.identifier.replace(/[\r\n\u2028\u2029]/g, "")}`,
      ) as (
        argumentError: typeof ArgumentError,
        safe: typeof htmlSafe,
        outputBuffer: typeof OutputBuffer,
      ) => CompiledMethod;
    } catch (error) {
      throw new SyntaxErrorInTemplate(this, this.source, error as Error);
    }

    const method = factory(ArgumentError, htmlSafe, OutputBuffer);
    mod._compiledMethods.set(methodName, method);

    if (!this.isStrictLocals()) return;

    const parameters = method.parameters!.filter(
      ([type, name]) => !(type === "req" && (name === "local_assigns" || name === "output_buffer")),
    );

    const nonKwargParameters = parameters.filter(
      ([type]) => !["keyreq", "key", "keyrest", "nokey"].includes(type),
    );

    const last = nonKwargParameters.at(-1);
    if (last?.[0] === "block" && last[1] === "_") nonKwargParameters.pop();

    if (nonKwargParameters.length > 0) {
      mod._compiledMethods.delete(methodName);

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
    if (this.isStrictLocals()) return "";

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

  return lines.map((line) => ` ${line}`).join("");
}

function stringHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}
