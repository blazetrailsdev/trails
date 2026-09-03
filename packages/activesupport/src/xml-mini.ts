import { camelize, singularize, underscore } from "./inflector.js";
import { htmlEscape } from "./core-ext/tse/util.js";
import { BigDecimal, toD } from "./core-ext/big-decimal/conversions.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import { StringIO } from "@blazetrails/ruby-compat";
import { Temporal, Date as RubyDate, DateTime } from "@blazetrails/date";
import { Duration } from "./duration.js";
import { ArgumentError } from "./hash-utils.js";
import { rbObjAsString as toS } from "@blazetrails/ruby-compat";
import { toF, toI } from "./core-ext/string/conversions.js";
import * as XmlMini_REXML from "./xml-mini/rexml.js";

export const FileLike = {
  /** @internal */
  _originalFilename: undefined as string | undefined,
  /** @internal */
  _contentType: undefined as string | undefined,

  set originalFilename(value: string | undefined) {
    this._originalFilename = value;
  },

  set contentType(value: string | undefined) {
    this._contentType = value;
  },

  get originalFilename(): string {
    return this._originalFilename ?? "untitled";
  },

  get contentType(): string {
    return this._contentType ?? "application/octet-stream";
  },
};

export interface XmlMiniBackend {
  parse(data: string | StringIO | null | undefined): Record<string, unknown>;

  /** @internal */
  _require?(): Promise<void>;
}

export type XmlMiniBackendName = XmlMiniBackend | string;

const DEFAULT_ENCODINGS: Record<string, string> = {
  binary: "base64",
};

const FORMATTING: Record<string, (value: unknown) => string> = {
  symbol: (value) => {
    const s = String(value);
    return s.startsWith(":") ? s.slice(1) : s;
  },
  date: (value) => (value instanceof Temporal.PlainDate ? value.toString() : String(value)),
  time: (value) => (value instanceof Temporal.PlainTime ? value.toString() : String(value)),
  dateTime: formatDateTime,
  duration: (value) => (value instanceof Temporal.Duration ? value.toString() : String(value)),
  binary: encode64,
};

function encode64(value: unknown): string {
  const bytes =
    typeof value === "string" ? Buffer.from(value, "binary") : Buffer.from(value as Uint8Array);
  const b64 = bytes.toString("base64");
  if (b64 === "") return "";
  return (b64.match(/.{1,60}/g) ?? []).join("\n") + "\n";
}

function decode64(value: string): string {
  return Buffer.from(value, "base64").toString("binary");
}

function formatDateTime(value: unknown): string {
  // boundary: legacy JS Date values serialize as ISO 8601 dateTime.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  if (typeof (value as { xmlschema?: unknown })?.xmlschema === "function") {
    return (value as { xmlschema(): string }).xmlschema();
  }
  if (value instanceof Temporal.ZonedDateTime) {
    return value.toString({ timeZoneName: "never" });
  }
  if (value instanceof Temporal.Instant || value instanceof Temporal.PlainDateTime) {
    return value.toString();
  }
  return String(value);
}

const XMLSCHEMA = /^(-?\d+)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(\.\d+)?(Z|[+-]\d\d:\d\d)?$/;

export const PARSING: Record<
  string,
  (value: unknown, entity?: Record<string, string | undefined>) => unknown
> = {
  symbol: (symbol) => {
    const s = String(symbol);
    return s.startsWith(":") ? s : `:${s}`;
  },
  date: (date) => RubyDate.parse(date as string),
  datetime: (time) => {
    try {
      const s = String(time).trim();
      if (!XMLSCHEMA.test(s)) {
        throw new ArgumentError(`invalid xmlschema format: ${JSON.stringify(s)}`);
      }
      return Temporal.Instant.from(/(Z|[+-]\d\d:\d\d)$/.test(s) ? s : `${s}Z`);
    } catch {
      const parsed = DateTime.parse(String(time));
      return parsed instanceof Temporal.ZonedDateTime
        ? parsed.toInstant()
        : parsed.toZonedDateTime("UTC").toInstant();
    }
  },
  duration: (duration) => Duration.parse(String(duration)),
  integer: (integer) => toI(String(integer)),
  float: (float) => toF(String(float)),
  decimal: (number) => {
    if (typeof number === "string") {
      return toD(number);
    }
    if (typeof number === "number" && !Number.isInteger(number)) {
      throw new ArgumentError("can't omit precision for a Float.");
    }
    return new BigDecimal(number as string | number | bigint);
  },
  boolean: (boolean) => ["1", "true"].includes(String(boolean).trim()),
  string: (string) => toS(string),
  yaml: async (yaml) => {
    try {
      const { parse: parseYaml } = await import("./yaml.js");
      if (typeof yaml !== "string") {
        // eslint-disable-next-line blazetrails/rails-error-parity
        throw new TypeError("no implicit conversion into String");
      }
      return parseYaml(yaml);
    } catch {
      return yaml;
    }
  },
  base64Binary: (bin) => decode64(String(bin)),
  hexBinary: (bin) => _parseHexBinary(String(bin)),
  binary: (bin, entity) => _parseBinary(String(bin), entity ?? {}),
  file: (file, entity) => _parseFile(String(file), entity ?? {}),
};

Object.assign(PARSING, {
  double: PARSING["float"],
  dateTime: PARSING["datetime"],
});

/** @internal */
let _depth = 100;

export function depth(): number {
  return _depth;
}

export function setDepth(value: number): void {
  _depth = value;
}

/** @internal */
let _backend: XmlMiniBackend | null | undefined;

export function parse(data: string | StringIO | null | undefined): Record<string, unknown> {
  return backend()!.parse(data);
}

export function backend(): XmlMiniBackend | null | undefined {
  return currentThreadBackend() ?? _backend;
}

export async function setBackend(name: XmlMiniBackendName | null | undefined): Promise<void> {
  const backend = name != null ? await castBackendNameToModule(name) : name;
  if (currentThreadBackend() != null) await setCurrentThreadBackend(backend);
  _backend = backend;
}

export async function withBackend<T>(
  name: XmlMiniBackendName | null | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  const oldBackend = currentThreadBackend();
  try {
    await setCurrentThreadBackend(name != null ? await castBackendNameToModule(name) : name);
    return await fn();
  } finally {
    await setCurrentThreadBackend(oldBackend);
  }
}

export interface XmlBuilder {
  tag(name: string, content?: string | null, attributes?: Record<string, string>): void;
  openTag(name: string, attributes?: Record<string, string>): void;
  closeTag(name: string): void;
  instruct(): void;
  target(): string;
}

export interface XmlTypeInfo {
  types: Record<string, string | undefined>;
  nested: Record<string, XmlTypeInfo>;
}

export interface RenameKeyOptions {
  dasherize?: boolean;
  camelize?: boolean | "lower" | "upper";
}

export interface ToTagOptions extends RenameKeyOptions {
  builder: XmlBuilder;
  type?: string;
  typeInfo?: XmlTypeInfo;
  underscoreKeys?: boolean;
  skipTypes?: boolean | number;
  encoding?: string;
  children?: string;
  root?: unknown;
  skipInstruct?: boolean;
}

function inferTypeName(value: unknown): string | undefined {
  if (value == null) return undefined;
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "bigint":
      return "integer";
    case "number":
      return Number.isInteger(value) ? "integer" : "float";
    case "string":
      return value.startsWith(":") ? "symbol" : undefined;
  }
  if (value instanceof BigDecimal) return "decimal";
  // boundary: a JS Date maps to the XML `dateTime` type.
  if (value instanceof Date) return "dateTime";
  if (value instanceof Temporal.PlainDate) return "date";
  if (value instanceof Temporal.PlainTime) return "time";
  if (value instanceof Temporal.Duration) return "duration";
  if (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.ZonedDateTime ||
    typeof (value as { xmlschema?: unknown }).xmlschema === "function"
  ) {
    return "dateTime";
  }
  return (value as { constructor?: { name?: string } }).constructor?.name;
}

function tagKey(key: unknown, options: ToTagOptions): string {
  const name = String(key);
  return options.underscoreKeys ? underscore(name) : name;
}

function isHash(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export interface ToXmlOptions extends Omit<ToTagOptions, "builder"> {
  indent?: number;
  root?: string;
  builder?: XmlBuilder;
  skipInstruct?: boolean;
}

/** @missingRailsCall call — PERMANENT */
export function toTag(key: unknown, value: unknown, options: ToTagOptions): void {
  const { builder } = options;
  const explicitType = options.type;
  const merged: ToTagOptions = { ...options, type: undefined, root: key, skipInstruct: true };

  if (typeof value === "function") {
    if (value.length === 1) value(merged);
    else value(merged, singularize(String(key)));
    return;
  }
  if (
    value != null &&
    "toXml" in Object(value) &&
    typeof (value as { toXml?: unknown }).toXml === "function"
  ) {
    (value as { toXml(o: ToTagOptions): void }).toXml(merged);
    return;
  }
  if (Array.isArray(value)) {
    emitArray(key, value, merged);
    return;
  }
  if (isHash(value)) {
    emitHash(key, value, merged);
    return;
  }

  let typeName = explicitType ?? inferTypeName(value);
  if (typeName === "datetime") typeName = "dateTime";

  const renamed = renameKey(tagKey(key, options), options);
  const attributes: Record<string, string> = {};
  if (!(options.skipTypes || typeName == null)) attributes.type = typeName;
  if (value == null) attributes.nil = "true";
  const encoding = options.encoding ?? (typeName ? DEFAULT_ENCODINGS[typeName] : undefined);
  if (encoding) attributes.encoding = encoding;

  const formatter = typeName ? FORMATTING[typeName] : undefined;
  const content = value == null ? undefined : formatter ? formatter(value) : String(value);
  builder.tag(renamed, content, attributes);
}

function emitArray(key: unknown, values: unknown[], options: ToTagOptions): void {
  const root = renameKey(tagKey(key, options), options);
  const attributes: Record<string, string> = options.skipTypes ? {} : { type: "array" };
  if (values.length === 0) {
    options.builder.tag(root, undefined, attributes);
    return;
  }
  options.builder.openTag(root, attributes);
  const children = options.children ?? singularize(root);
  for (const item of values) {
    toTag(children, item, { ...options, type: undefined, children: undefined, root: children });
  }
  options.builder.closeTag(root);
}

function emitHash(key: unknown, hash: Record<string, unknown>, options: ToTagOptions): void {
  const root = renameKey(tagKey(key, options), options);
  const info = options.typeInfo;
  options.builder.openTag(root, {});
  for (const [k, v] of Object.entries(hash)) {
    toTag(k, v, { ...options, type: info?.types[k], typeInfo: info?.nested[k], root: k });
  }
  options.builder.closeTag(root);
}

export function renameKey(key: string, options: RenameKeyOptions = {}): string {
  const { camelize: camelizeOpt } = options;
  const dasherize = options.dasherize === undefined || options.dasherize;
  let result = key;
  if (camelizeOpt) {
    result = camelizeOpt === true ? camelize(result) : camelize(result, camelizeOpt);
  }
  if (dasherize) {
    result = _dasherize(result);
  }
  return result;
}

/** @internal */
export function _dasherize(key: string): string {
  const match = key.trim().match(/^(_*)([\s\S]*?)(_*)$/);
  if (!match) return key;
  const [, left, middle, right] = match;
  return `${left}${middle.replace(/[_ ]/g, "-")}${right}`;
}

/** @internal */
export function _parseBinary(bin: string, entity: Record<string, string | undefined>): string {
  switch (entity["encoding"]) {
    case "base64":
      return decode64(bin);
    case "hex":
    case "hexBinary":
      return _parseHexBinary(bin);
    default:
      return bin;
  }
}

/** @internal */
export function _parseFile(
  file: string,
  entity: Record<string, string | undefined>,
): StringIO & typeof FileLike {
  const f = new StringIO(decode64(file));
  Object.defineProperties(f, Object.getOwnPropertyDescriptors(FileLike));
  const fileLike = f as StringIO & typeof FileLike;
  fileLike.originalFilename = entity["name"];
  fileLike.contentType = entity["content_type"];
  return fileLike;
}

/** @internal */
export function _parseHexBinary(bin: string): string {
  return Buffer.from(bin, "hex").toString("binary");
}

/** @internal */
export function currentThreadBackend(): XmlMiniBackend | null | undefined {
  return IsolatedExecutionState.get("xml_mini_backend");
}

/** @internal */
export async function setCurrentThreadBackend(
  name: XmlMiniBackendName | null | undefined,
): Promise<void> {
  IsolatedExecutionState.set(
    "xml_mini_backend",
    name != null ? await castBackendNameToModule(name) : name,
  );
}

const XML_MINI_BACKENDS: Record<string, (() => Promise<unknown>) | string> = {
  jdom: "JRuby is required to use the JDOM backend for XmlMini",
  libxml: "cannot load such file -- libxml",
  libxmlsax: "cannot load such file -- libxml",
  nokogiri: () => import("./xml-mini/nokogiri.js"),
  nokogirisax: () => import("./xml-mini/nokogirisax.js"),
  rexml: () => import("./xml-mini/rexml.js"),
};

/** @internal */
export async function castBackendNameToModule(name: XmlMiniBackendName): Promise<XmlMiniBackend> {
  if (typeof name !== "string") {
    await name._require?.();
    return name;
  } else {
    const backend = XML_MINI_BACKENDS[name.toLowerCase()];
    if (typeof backend === "function") {
      const module = (await backend()) as XmlMiniBackend;
      await module._require?.();
      return module;
    }
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(
      backend ?? `cannot load such file -- active_support/xml_mini/${name.toLowerCase()}`,
    );
  }
}

function attributeString(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([k, v]) => ` ${k}="${htmlEscape(v).toString()}"`)
    .join("");
}

export class XmlStringBuilder implements XmlBuilder {
  private buffer = "";

  tag(name: string, content?: string | null, attributes: Record<string, string> = {}): void {
    const attrs = attributeString(attributes);
    if (content == null) {
      this.buffer += `<${name}${attrs}/>`;
    } else {
      this.buffer += `<${name}${attrs}>${htmlEscape(content).toString()}</${name}>`;
    }
  }

  openTag(name: string, attributes: Record<string, string> = {}): void {
    this.buffer += `<${name}${attributeString(attributes)}>`;
  }

  closeTag(name: string): void {
    this.buffer += `</${name}>`;
  }

  instruct(): void {
    this.buffer = `<?xml version="1.0" encoding="UTF-8"?>` + this.buffer;
  }

  target(): string {
    return this.buffer;
  }
}

export class IndentedXmlStringBuilder implements XmlBuilder {
  private buffer = "";
  private depth = 0;

  constructor(
    private readonly baseIndent = "",
    private readonly indentWidth = 2,
  ) {}

  private indent(): string {
    return this.baseIndent + " ".repeat(this.indentWidth).repeat(this.depth);
  }

  private newline(): string {
    return this.indentWidth === 0 ? "" : "\n";
  }

  tag(name: string, content?: string | null, attributes: Record<string, string> = {}): void {
    const attrs = attributeString(attributes);
    this.buffer +=
      content == null
        ? `${this.indent()}<${name}${attrs}/>${this.newline()}`
        : `${this.indent()}<${name}${attrs}>${htmlEscape(content).toString()}</${name}>${this.newline()}`;
  }

  openTag(name: string, attributes: Record<string, string> = {}): void {
    this.buffer += `${this.indent()}<${name}${attributeString(attributes)}>${this.newline()}`;
    this.depth += 1;
  }

  closeTag(name: string): void {
    this.depth -= 1;
    this.buffer += `${this.indent()}</${name}>${this.newline()}`;
  }

  instruct(): void {
    this.buffer =
      `${this.baseIndent}<?xml version="1.0" encoding="UTF-8"?>${this.newline()}` + this.buffer;
  }

  target(): string {
    return this.buffer;
  }
}

_backend = XmlMini_REXML;
