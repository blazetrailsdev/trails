import {
  Notifications,
  pluralize,
  SafeBuffer,
  toSentence,
  TopLevel,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  Encoding,
  forceEncoding,
  isValidEncoding,
  LoadError,
  NotImplementedError,
  rbModConstSet,
  rbInspect,
  rbModName,
  rbObjRespondTo,
  rbStrEnumerateLines,
} from "@blazetrails/ruby-compat";
import { ENCODING_FLAG } from "./action-view.js";
import type { Base, CompiledMethod, CompiledMethodContainer } from "./base.js";
import { OutputBuffer, StreamingBuffer } from "./buffers.js";
import { ActionView } from "./namespaces.js";
import { SyntaxErrorInTemplate, TemplateError, WrongEncodingError } from "./template/error.js";
import { TemplateHandlers, type TemplateHandler } from "./template/handlers.js";
import { Html } from "./template/handlers/html.js";
import { Raw } from "./template/handlers/raw.js";
import { TSE } from "./template/handlers/tse.js";
import { SimpleType } from "./template/types.js";
import { File as SourcesFile } from "./template/sources/file.js";
import { type BacktraceLocation, type Spot } from "./template/handlers/tse.js";

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
const LEADING_ENCODING_REGEXP = new RegExp(`^${ENCODING_FLAG}`);
const VARIABLE_FROM_BASENAME = /^_?(.*?)(?:\.\w+)*$/;
const NONE = Symbol("Template::NONE");

let nextObjectId = 0;
let loads = 0;

type StandIn = (
  this: Base,
  context: Base,
  locals: Record<string, unknown>,
  block?: (...name: unknown[]) => unknown,
) => unknown;

type TemplateCompiler = (
  template: Template,
  methodName: string,
  source: string,
  file: boolean,
) => Promise<{ default: StandIn }>;

let templateCompiler: TemplateCompiler = async (template, methodName, _source, file) => {
  if (!file) {
    // @nie disposition=TODO
    throw new NotImplementedError(
      `${template.inspect()} has no compiled module: templates are precompiled by build-views, and a template built from a string is compiled only in test code`,
    );
  }
  const { identifier } = template;
  const at = identifier.lastIndexOf("/app/views/");
  const compiled =
    at === -1
      ? `${identifier}.js`
      : `${identifier.slice(0, at)}/.trails/views/${identifier.slice(at + "/app/views/".length)}.js`;
  const url = new URL(compiled, "file:///");
  url.search = `?${methodName}-${(loads += 1)}`;
  try {
    return (await import(url.href)) as { default: StandIn };
  } catch (error) {
    if (
      (error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND" ||
      !(error as Error).message.includes(compiled)
    ) {
      throw error;
    }
    throw new LoadError(`cannot load such file -- ${compiled}`);
  }
};

/** @noRailsEquivalent PERMANENT */
export function setTemplateCompiler(compiler: TemplateCompiler): TemplateCompiler {
  const previous = templateCompiler;
  templateCompiler = compiler;
  return previous;
}

export interface TemplateOptions {
  locals: readonly string[];
  format?: string | null;
  variant?: string | null;
  virtualPath?: string | null;
}

export class Template {
  static {
    TemplateHandlers.registerDefaultTemplateHandler("raw", new Raw());
    TemplateHandlers.registerTemplateHandler("tse", new TSE());
    TemplateHandlers.registerTemplateHandler("html", new Html());
    TemplateHandlers.registerTemplateHandler("ruby", {
      call: (_: unknown, source: string) => source,
    });
  }

  static frozenStringLiteral: boolean | null | undefined = false;

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

  encodeBang(): string {
    let source = this.source;

    if (!(this._source instanceof SourcesFile)) return source;

    let encoding: string | Encoding;
    let magicEncoding: string | null = null;
    const match = LEADING_ENCODING_REGEXP.exec(source);
    if (match) {
      source = source.replace(LEADING_ENCODING_REGEXP, "");
      encoding = magicEncoding = match[1];
    } else {
      encoding = Encoding.defaultExternal;
    }

    const bytes = source;
    source = forceEncoding(source, encoding);

    if (
      !magicEncoding &&
      rbObjRespondTo(this.handler, "handlesEncoding") &&
      this.handler.handlesEncoding?.()
    ) {
      return source;
    } else if (isValidEncoding(bytes, encoding)) {
      return source;
    } else {
      throw new WrongEncodingError(source, encoding);
    }
  }

  get locals(): readonly string[] | null {
    return this.isStrictLocals() ? null : this._locals;
  }

  get type(): ReturnType<TypesImplementation["get"]> {
    return (this._type ??= Template.Types.get(this.format));
  }

  get shortIdentifier(): string {
    if (this._shortIdentifier) return this._shortIdentifier;
    if (TopLevel.Trails === undefined) return (this._shortIdentifier = this.identifier);
    const prefix = `${TopLevel.Trails.root() ?? ""}/`;
    return (this._shortIdentifier = this.identifier.startsWith(prefix)
      ? this.identifier.slice(prefix.length)
      : this.identifier);
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
    const scriptLines = rbStrEnumerateLines(this.compiledSource().source, []);
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

  marshalDump(): unknown[] {
    return [
      this._source,
      this.identifier,
      this.handler,
      this._compiled,
      this._locals,
      this.virtualPath,
      this.format,
      this.variant,
    ];
  }

  marshalLoad(array: unknown[]): void {
    const [_source, identifier, handler, _compiled, _locals, virtualPath, format, variant] = array;
    Object.assign(this, {
      _source,
      identifier,
      handler,
      _compiled,
      _locals,
      virtualPath,
      format,
      variant,
    });
  }

  async render(
    view: Base,
    locals: Record<string, unknown> = {},
    buffer: OutputBuffer | StreamingBuffer | null = null,
    {
      implicitLocals = [],
      addToStack = true,
    }: { implicitLocals?: readonly string[]; addToStack?: boolean } = {},
    block?: (...name: unknown[]) => unknown,
  ): Promise<string | SafeBuffer | null> {
    const streaming = buffer instanceof StreamingBuffer;
    try {
      return await this.instrumentRenderTemplate<Promise<string | SafeBuffer | null>>(async () => {
        await this.compileBang(view, streaming);

        if (this.isStrictLocals() && this._strictLocalKeys && implicitLocals.length > 0) {
          const localsToIgnore = implicitLocals.filter((l) => !this._strictLocalKeys!.includes(l));
          for (const key of localsToIgnore) delete locals[key];
        }

        if (buffer) {
          await view._run(
            streaming ? this.streamingMethodName() : this.methodName(),
            this,
            locals,
            buffer as OutputBuffer,
            { addToStack, hasStrictLocals: this.isStrictLocals() },
            block,
          );
          return null;
        } else {
          const result = await view._run(
            this.methodName(),
            this,
            locals,
            new OutputBuffer(),
            { addToStack, hasStrictLocals: this.isStrictLocals() },
            block,
          );
          return result instanceof OutputBuffer
            ? result.toString()
            : (result as string | SafeBuffer);
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
    return `#<${rbModName(this.constructor)} ${this.shortIdentifier} locals=${rbInspect(
      this.locals?.map((local) => `:${local}`) ?? null,
    )}>`;
  }

  toString(): string {
    return this.inspect();
  }

  /**
   * @internal
   * @missingRailsArgs compile — PERMANENT
   */
  private async compileBang(view: Base, streaming = false): Promise<void> {
    if (streaming ? this._compiledStreaming : this._compiled) return;

    const mod = view.compiledMethodContainer();

    await this.instrument<Promise<void>>("!compile_template", () => this.compile(mod, streaming));

    if (streaming) this._compiledStreaming = true;
    else this._compiled = true;
  }

  /** @internal */
  private streamingMethodName(): string {
    return `${this.methodName()}_streaming`;
  }

  /**
   * @internal
   * @missingRailsCall call — PERMANENT
   */
  private compiledSource(): { source: string; methodArguments: string } {
    const setStrictLocals = this.strictLocalsBang();
    const source = this.encodeBang();

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

    if (/\p{Surrogate}/u.test(source)) {
      throw new WrongEncodingError(source, Encoding.defaultInternal);
    }

    return { source, methodArguments };
  }

  /** @internal */
  protected async compile(mod: CompiledMethodContainer, streaming = false): Promise<void> {
    const methodName = streaming ? this.streamingMethodName() : this.methodName();
    const { source: compiledSource, methodArguments } = this.compiledSource();
    const strictLocals = this.isStrictLocals();

    let render: StandIn;
    let signature: Parameter[];
    try {
      signature = methodParameters(methodArguments);
      ({ default: render } = await templateCompiler(
        this,
        methodName,
        compiledSource,
        this._source instanceof SourcesFile,
      ));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new SyntaxErrorInTemplate(this, compiledSource, error);
    }
    Object.defineProperty(render, "name", { value: methodName });

    const virtualPath = this.virtualPath;
    const keyreq = signature.filter(([type]) => type === "keyreq").map(([, name]) => name!);
    const keywords = signature
      .filter(([type]) => type === "keyreq" || type === "key")
      .map(([, name]) => name!);
    const nokey = signature.some(([type]) => type === "nokey");
    const keyrest = signature.find(([type]) => type === "keyrest");
    const method: CompiledMethod = function (
      this: Base,
      localAssigns,
      _outputBuffer,
      kwargs = {},
      _,
    ) {
      if (strictLocals) {
        const missing = keyreq.filter((k) => !Object.hasOwn(kwargs, k));
        if (missing.length > 0) {
          throw new ArgumentError(
            `missing keyword${missing.length > 1 ? "s" : ""}: ${missing.map((k) => `:${k}`).join(", ")}`,
          );
        }
        if (nokey) {
          if (Object.keys(kwargs).length > 0) throw new ArgumentError("no keywords accepted");
        } else if (!keyrest) {
          const unknown = Object.keys(kwargs).filter((k) => !keywords.includes(k));
          if (unknown.length > 0) {
            throw new ArgumentError(
              `unknown keyword${unknown.length > 1 ? "s" : ""}: ${unknown.map((k) => `:${k}`).join(", ")}`,
            );
          }
        }
      }
      this.virtualPath = virtualPath;
      return render.call(this, this, strictLocals ? kwargs : localAssigns, _);
    };
    method.parameters = signature.map(([type, name]) =>
      name === undefined ? [type] : [type, name],
    );
    mod._compiledMethods.set(methodName, method);

    if (!this.isStrictLocals()) return;

    const parameters = method.parameters.filter(
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
      throw new TemplateError(this, e instanceof Error ? e : new Error(String(e)));
    }
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

rbModConstSet(ActionView, "Template", Template);
rbModConstSet(Template, "Error", TemplateError);

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
