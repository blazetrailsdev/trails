import { camelize, singularize, underscore } from "./inflector.js";
import { htmlEscape } from "./core-ext/tse/util.js";
import { BigDecimal } from "./core-ext/big-decimal/conversions.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import { StringIO } from "./string-io.js";
import { Temporal, Date as RubyDate, DateTime } from "@blazetrails/date";
import { Duration } from "./duration.js";
import { ArgumentError } from "./hash-utils.js";
import { toS } from "./core-ext/object/inspect.js";
import * as XmlMini_REXML from "./xml-mini/rexml.js";

/**
 * This object decorates files deserialized using `Hash.fromXml` with the
 * `originalFilename` and `contentType` methods.
 *
 * Mirrors: ActiveSupport::XmlMini::FileLike (xml_mini.rb:22-31) — a Ruby module
 * `_parseFile` `extend`s onto the StringIO it returns, so the descriptors are
 * copied onto that object rather than inherited from a class.
 */
export const FileLike = {
  /** @internal `@original_filename` */
  _originalFilename: undefined as string | undefined,
  /** @internal `@content_type` */
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

/**
 * A pluggable parse backend — the trails analog of the `XmlMini_REXML`,
 * `XmlMini_Nokogiri`, … modules `backend` holds (xml_mini.rb:101-109). Rails
 * `require`s `active_support/xml_mini/<name>` and reads the constant out of
 * `ActiveSupport`; here the module namespace object of
 * `./xml-mini/<name>.js` *is* that module.
 *
 * Rails' backends return the parsed Hash synchronously; ours are async because
 * each loads its optional parser package (`@blazetrails/nokogiri`) through a
 * dynamic import — see `xml-mini/nokogirisax.ts:55` and `xml-mini/nokogiri.ts:99`.
 */
export interface XmlMiniBackend {
  parse(data: string | StringIO | null | undefined): Promise<Record<string, unknown>>;
}

/** The name of a backend, or the backend module itself. */
export type XmlMiniBackendName = XmlMiniBackend | string;

/** Mirrors: ActiveSupport::XmlMini::DEFAULT_ENCODINGS. */
const DEFAULT_ENCODINGS: Record<string, string> = {
  binary: "base64",
};

/**
 * Per-type value formatters. Mirrors: ActiveSupport::XmlMini::FORMATTING —
 * the JS type each entry receives is the trails analog of the Ruby class that
 * `TYPE_NAMES` maps to the same tag name (e.g. `Temporal.Duration` ↔
 * `ActiveSupport::Duration`).
 */
const FORMATTING: Record<string, (value: unknown) => string> = {
  symbol: (value) => (typeof value === "symbol" ? (value.description ?? "") : String(value)),
  date: (value) => (value instanceof Temporal.PlainDate ? value.toString() : String(value)),
  time: (value) => (value instanceof Temporal.PlainTime ? value.toString() : String(value)),
  dateTime: formatDateTime,
  duration: (value) => (value instanceof Temporal.Duration ? value.toString() : String(value)),
  binary: encode64,
};

/**
 * Base64-encode binary content, mirroring Ruby's `Base64.encode64`: MIME line
 * wrapping at 60 characters, each line (including the last) terminated by `\n`.
 * Accepts a byte array or a binary (Latin-1) string, matching how Rails' binary
 * columns arrive.
 */
function encode64(value: unknown): string {
  const bytes =
    typeof value === "string" ? Buffer.from(value, "binary") : Buffer.from(value as Uint8Array);
  const b64 = bytes.toString("base64");
  // Empty input encodes to "" (no trailing newline); otherwise chunk into
  // 60-char lines joined by "\n" with a single trailing "\n" — matching
  // Base64.encode64 exactly, including when the length is a multiple of 60.
  if (b64 === "") return "";
  return (b64.match(/.{1,60}/g) ?? []).join("\n") + "\n";
}

/**
 * Decode Base64 content, mirroring Ruby's `Base64.decode64`: any character
 * outside the Base64 alphabet (the line breaks `encode64` inserts included) is
 * ignored. The decoded bytes come back as a binary (Latin-1) string, the same
 * shape {@link encode64} accepts.
 */
function decode64(value: string): string {
  return Buffer.from(value, "base64").toString("binary");
}

function formatDateTime(value: unknown): string {
  // boundary: legacy JS Date values serialize as ISO 8601 dateTime.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  // ActiveSupport::TimeWithZone (and any zoned wall-clock) exposes #xmlschema,
  // which keeps the local offset — Rails' `time.xmlschema`.
  if (typeof (value as { xmlschema?: unknown })?.xmlschema === "function") {
    return (value as { xmlschema(): string }).xmlschema();
  }
  if (value instanceof Temporal.ZonedDateTime) {
    // Drop the IANA `[Zone]` annotation so the lexical form is a valid XML
    // Schema dateTime while keeping the numeric offset (unlike a UTC recast).
    return value.toString({ timeZoneName: "never" });
  }
  if (value instanceof Temporal.Instant || value instanceof Temporal.PlainDateTime) {
    return value.toString();
  }
  return String(value);
}

/**
 * The lexical form `Time.xmlschema` accepts (Ruby stdlib `lib/time.rb`) —
 * extended format only, seconds required, offset optional.
 */
const XMLSCHEMA = /^(-?\d+)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(\.\d+)?(Z|[+-]\d\d:\d\d)?$/;

/**
 * Per-type value parsers, keyed by the `type=` attribute a document carries.
 *
 * Mirrors: ActiveSupport::XmlMini::PARSING (xml_mini.rb:66-96), including the
 * trailing `PARSING.update("double" => PARSING["float"], "dateTime" =>
 * PARSING["datetime"])` aliasing at xml_mini.rb:93-96.
 */
export const PARSING: Record<
  string,
  (value: unknown, entity?: Record<string, string | undefined>) => unknown
> = {
  // `symbol.to_s.to_sym` (xml_mini.rb:68). A Ruby Symbol is a colon-prefixed
  // string in trails, so `to_s` on a value that is already a Symbol drops the
  // colon that `to_sym` puts straight back.
  symbol: (symbol) => {
    const s = String(symbol);
    return s.startsWith(":") ? s : `:${s}`;
  },
  date: (date) => RubyDate.parse(date as string),
  // `Time.xmlschema(time).utc rescue ::DateTime.parse(time).utc`
  // (xml_mini.rb:70). @blazetrails/date carries `Time#xmlschema` for
  // formatting but no `Time.xmlschema` reader — that is Ruby's stdlib
  // lib/time.rb, not Rails — so the lexical form is gated on that method's own
  // regex before `Temporal.Instant.from` runs. The gate is load-bearing:
  // Temporal also accepts ISO *basic* format, so a bare `Instant.from` reads
  // "2013-11-12T0211Z" as 02:11 where `Time.xmlschema` raises and Ruby falls
  // through to `DateTime.parse`, which reads no time at all. Only the strict
  // arm is guarded, exactly as the Ruby `rescue` modifier binds: a
  // `DateTime.parse` failure propagates.
  datetime: (time) => {
    try {
      const s = String(time).trim();
      if (!XMLSCHEMA.test(s)) {
        throw new ArgumentError(`invalid xmlschema format: ${JSON.stringify(s)}`);
      }
      // An offset-less lexical form is local time to `Time.xmlschema`; trails
      // has no local-zone seat here, so it reads as UTC.
      return Temporal.Instant.from(/(Z|[+-]\d\d:\d\d)$/.test(s) ? s : `${s}Z`);
    } catch {
      const parsed = DateTime.parse(String(time));
      // Ruby's `DateTime#utc` is `new_offset(0)`; an offset-less lexical form
      // parses to a PlainDateTime, which Ruby reads as +00:00 already.
      return parsed instanceof Temporal.ZonedDateTime
        ? parsed.toInstant()
        : parsed.toZonedDateTime("UTC").toInstant();
    }
  },
  duration: (duration) => Duration.parse(String(duration)),
  integer: (integer) => toI(integer),
  float: (float) => toF(float),
  decimal: (number) => {
    if (typeof number === "string") {
      return toD(number);
    }
    // Ruby's `BigDecimal(Float)` raises ArgumentError ("can't omit precision
    // for a Float"); only Integers convert without an explicit precision.
    if (typeof number === "number" && !Number.isInteger(number)) {
      throw new ArgumentError("can't omit precision for a Float.");
    }
    return new BigDecimal(number as string | number | bigint);
  },
  boolean: (boolean) => ["1", "true"].includes(String(boolean).trim()),
  string: (string) => toS(string),
  // `YAML.load(yaml) rescue yaml` (xml_mini.rb:83). `yaml` is an
  // optionalDependency and this module sits in the package's root graph, so
  // the parser is reached through the `./yaml.js` shim by a call-time
  // `import()` — a static edge would either break the root import when the
  // package is absent or drag top-level await into two bundles that cannot
  // represent it. This is the one entry in the table that returns a Promise.
  yaml: async (yaml) => {
    try {
      const { parse: parseYaml } = await import("./yaml.js");
      if (typeof yaml !== "string") {
        // Ruby's `YAML.load` takes a String; anything else raises there, and
        // the `rescue` modifier hands the input straight back. The raise is
        // Ruby's core TypeError — there is no Rails error class to port here,
        // the same reason `yaml.ts:16` gives for its own LoadError stand-in.
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

/**
 * Ruby `String#to_i` / `Numeric#to_i`: a leading integer is taken and the rest
 * of the string discarded, with no match yielding 0; Floats truncate.
 */
function toI(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value);
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Ruby `String#to_f` / `Numeric#to_f`: a leading float is taken and the rest of
 * the string discarded (so `"123,003"` is `123.0`), with no match yielding 0.0.
 */
function toF(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = parseFloat(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Ruby `String#to_d`: like `to_f`, the leading numeric prefix is taken and the
 * remainder discarded, so this never raises where `BigDecimal(str)` would.
 */
function toD(value: string): BigDecimal {
  const match = /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(value);
  return new BigDecimal(match ? match[0].trim() : "0");
}

/**
 * The maximum element nesting a backend will descend before raising.
 *
 * Mirrors: `attr_accessor :depth` / `self.depth = 100` (xml_mini.rb:97-98).
 *
 * @internal
 */
let _depth = 100;

/** Mirrors: ActiveSupport::XmlMini.depth (xml_mini.rb:97). */
export function depth(): number {
  return _depth;
}

/** Mirrors: ActiveSupport::XmlMini.depth= (xml_mini.rb:97). */
export function setDepth(value: number): void {
  _depth = value;
}

/**
 * The backend `parse` delegates to (Ruby's `@backend`).
 *
 * @internal
 */
let _backend: XmlMiniBackend | null | undefined;

/**
 * Parse an XML document into a hash through the current backend.
 *
 * Mirrors: `delegate :parse, to: :backend` (xml_mini.rb:99) — awaitable because
 * every backend's `parse` is (see {@link XmlMiniBackend}); the delegation itself
 * still forwards straight to the selected backend.
 */
export function parse(
  data: string | StringIO | null | undefined,
): Promise<Record<string, unknown>> {
  return backend()!.parse(data);
}

/**
 * The backend in effect: the execution-state-scoped override set by
 * {@link withBackend} if there is one, else the process-wide backend.
 *
 * Mirrors: ActiveSupport::XmlMini.backend (xml_mini.rb:101-103).
 */
export function backend(): XmlMiniBackend | null | undefined {
  return currentThreadBackend() ?? _backend;
}

/**
 * Set the process-wide backend, by name or module.
 *
 * Mirrors: ActiveSupport::XmlMini#backend= (xml_mini.rb:105-109) — awaitable
 * because resolving a name imports the backend module, which Ruby does
 * synchronously via `require`.
 */
export async function setBackend(name: XmlMiniBackendName | null | undefined): Promise<void> {
  const backend = name != null ? await castBackendNameToModule(name) : name;
  if (currentThreadBackend() != null) await setCurrentThreadBackend(backend);
  _backend = backend;
}

/**
 * Run `fn` with `name` as the backend, restoring the previous
 * execution-state-scoped backend afterwards.
 *
 * Mirrors: ActiveSupport::XmlMini#with_backend (xml_mini.rb:111-117).
 */
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

/**
 * A sink for XML fragments. `toTag` writes one value's tag(s) into it, so the
 * same per-value logic can target either a compact string (the parity default,
 * {@link XmlStringBuilder}) or an indentation-aware sink (ActiveModel's
 * `_hashToXml`).
 *
 * Mirrors: the `Builder::XmlMarkup` role in `ActiveSupport::XmlMini.to_tag`.
 */
export interface XmlBuilder {
  /** Emit a leaf `<name attrs>content</name>`, or `<name attrs/>` when `content` is nullish. */
  tag(name: string, content?: string | null, attributes?: Record<string, string>): void;
  /** Emit an opening `<name attrs>` for a container. */
  openTag(name: string, attributes?: Record<string, string>): void;
  /** Emit a closing `</name>`. */
  closeTag(name: string): void;
}

/**
 * A per-level cast-type table threaded through `to_tag`'s container recursion so
 * nested attributes keep an adapter-agnostic `type=` (a bigint id stays
 * `type="integer"` whether it arrives as a number, BigInt, or string). `types`
 * maps a hash key to its explicit `type=` name; `nested` carries the same table
 * for each container-valued key. Rails has no analog — its serialized hash still
 * holds typed Ruby objects — but trails' flattened hash loses the cast type, so
 * ActiveModel resolves it up front and threads it here.
 */
export interface XmlTypeInfo {
  types: Record<string, string | undefined>;
  nested: Record<string, XmlTypeInfo>;
}

export interface RenameKeyOptions {
  /** Convert `snake_case` keys to `dashed-keys`. Defaults to `true`. */
  dasherize?: boolean;
  /** Camelize the key first: `true`/`"upper"` for UpperCamel, `"lower"` for lowerCamel. */
  camelize?: boolean | "lower" | "upper";
}

export interface ToTagOptions extends RenameKeyOptions {
  /** The sink the emitted tag(s) are written to. */
  builder: XmlBuilder;
  /** Explicit `type=` name; suppresses runtime type inference when set. */
  type?: string;
  /**
   * Cast types for a container's children, threaded through `emitHash`/
   * `emitArray` so nested attributes keep an adapter-agnostic `type=`.
   */
  typeInfo?: XmlTypeInfo;
  /**
   * Underscore each tag key before {@link renameKey} runs. ActiveModel's
   * serialized keys are camelCase; Rails' are already snake_case, so this is
   * off by default and set only by `Model#toXml`.
   */
  underscoreKeys?: boolean;
  /** Suppress the inferred `type=` attribute (any truthy value, per Rails). */
  skipTypes?: boolean | number;
  /** Overrides `DEFAULT_ENCODINGS[type]` for the `encoding=` attribute. */
  encoding?: string;
  /** Explicit child tag name for array elements; defaults to the singularized root. */
  children?: string;
  /** Set by `to_tag` when recursing; the tag name passed to nested `toXml`. */
  root?: unknown;
  /** Always true once inside `to_tag` (no XML instruction on nested docs). */
  skipInstruct?: boolean;
}

/**
 * Resolve the `type=` name for a value from its runtime class, the trails
 * analog of `TYPE_NAMES[value.class.name]`. Strings return `undefined` (Ruby
 * skips the type for `to_str`-responders); unrecognized objects likewise carry
 * no type.
 */
function inferTypeName(value: unknown): string | undefined {
  if (value == null) return undefined;
  switch (typeof value) {
    case "symbol":
      return "symbol";
    case "boolean":
      return "boolean";
    case "bigint":
      return "integer";
    case "number":
      return Number.isInteger(value) ? "integer" : "float";
    case "string":
      return undefined;
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
  // Rails: `type_name ||= value.class.name if value && !value.respond_to?(:to_str)`
  // — an arbitrary object (no known mapping, not a string) is typed by its class.
  return (value as { constructor?: { name?: string } }).constructor?.name;
}

/** `key.to_s`: a symbol key renders as its name, everything else via `String`. */
function keyToString(key: unknown): string {
  return typeof key === "symbol" ? (key.description ?? "") : String(key);
}

/**
 * The stringified key, underscored first when `underscoreKeys` is set
 * (ActiveModel's camelCase keys) so a later `dasherize` has `_`/space
 * separators to rewrite. The result is still passed through {@link renameKey}
 * at each call site (kept a direct call there to mirror Rails' `to_tag`/
 * `Hash#to_xml`/`Array#to_xml`, which each call `rename_key`).
 */
function tagKey(key: unknown, options: ToTagOptions): string {
  const name = keyToString(key);
  return options.underscoreKeys ? underscore(name) : name;
}

/**
 * Whether a value is the trails analog of a Ruby `Hash` for `to_tag`. Rails
 * only routes an object through `Hash#to_xml` (field expansion) when it
 * `respond_to?(:to_xml)` — a plain Hash does, an arbitrary object does not.
 * We mirror that by restricting the hash path to plain objects (`{}`-literals /
 * null-prototype records); class instances fall through to the leaf path, where
 * `inferTypeName` supplies `value.class.name` as their `type=` (xml_mini.rb:133).
 */
function isHash(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Emit one value's XML tag into `options.builder`.
 *
 * Mirrors: ActiveSupport::XmlMini.to_tag (xml_mini.rb:118-149) — resolves the
 * `type=` name, applies `FORMATTING`, emits `nil="true"`/`encoding=` attributes,
 * calls {@link renameKey}, and recurses for callables, `toXml`-responders, and
 * array/hash values. This is the single per-value funnel that both
 * `Array#to_xml` and `ActiveModel::Serializers::Xml` route every tag through.
 */
export function toTag(key: unknown, value: unknown, options: ToTagOptions): void {
  const { builder } = options;
  const explicitType = options.type;
  const merged: ToTagOptions = { ...options, type: undefined, root: key, skipInstruct: true };

  if (typeof value === "function") {
    // A callable receives the merged options (with the builder); arity 1 gets
    // just the options, otherwise it also gets the singularized tag name.
    if (value.length === 1) value(merged);
    else value(merged, singularize(keyToString(key)));
    return;
  }
  if (value != null && typeof (value as { toXml?: unknown }).toXml === "function") {
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

/**
 * Emit an array as `<root type="array">` wrapping one child tag per element.
 *
 * Mirrors: Array#to_xml (conversions.rb:200-208) — the root is renamed first,
 * then `children = options.delete(:children) || root.singularize` (of the
 * *renamed* root), so a `camelize`/`dasherize` root propagates to the children
 * and callers can override the child name. `toTag` renames each child again,
 * matching Rails' `to_tag(children, value, options)`; `children` is consumed
 * at this level and not forwarded to the element tags.
 */
function emitArray(key: unknown, values: unknown[], options: ToTagOptions): void {
  const root = renameKey(tagKey(key, options), options);
  const attributes: Record<string, string> = options.skipTypes ? {} : { type: "array" };
  // Rails special-cases an empty array to `builder.tag!(root, attributes)` with
  // no block — the self-closing `<root type="array"/>` form.
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

/**
 * Emit a hash as `<root>` wrapping one tag per entry.
 *
 * Mirrors: Hash#to_xml (conversions.rb:85-90) — the root is renamed before it
 * is opened (the wrapper carries no `type=`), and each entry routes through
 * `to_tag`, which renames the entry key.
 */
function emitHash(key: unknown, hash: Record<string, unknown>, options: ToTagOptions): void {
  const root = renameKey(tagKey(key, options), options);
  const info = options.typeInfo;
  options.builder.openTag(root, {});
  for (const [k, v] of Object.entries(hash)) {
    // Resolve each child's explicit `type=` and next-level table from this
    // level's `typeInfo` so nested cast types survive the descent.
    toTag(k, v, { ...options, type: info?.types[k], typeInfo: info?.nested[k], root: k });
  }
  options.builder.closeTag(root);
}

/**
 * Apply the `camelize`/`dasherize` key transforms to a single XML tag name.
 *
 * Mirrors: ActiveSupport::XmlMini.rename_key (xml_mini.rb:154-161) — camelize (when requested) runs
 * first, then dasherize (default `true`) runs on the result. Both transforms
 * compose exactly as in Rails, so `camelize: true` still passes through
 * `_dasherize` (a no-op on an already-camelized, underscore-free key).
 */
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

/**
 * Dasherize an `underscore_key`, preserving any leading/trailing underscores.
 *
 * Mirrors: ActiveSupport::XmlMini._dasherize (xml_mini.rb:163-167) — the `$2` (interior) capture is
 * non-greedy so surrounding runs of underscores are left untouched and only the
 * interior `_`/space characters become `-`.
 *
 * @internal
 */
export function _dasherize(key: string): string {
  const match = key.trim().match(/^(_*)([\s\S]*?)(_*)$/);
  if (!match) return key;
  const [, left, middle, right] = match;
  return `${left}${middle.replace(/[_ ]/g, "-")}${right}`;
}

/**
 * Decode a `type="binary"` value according to its element's `encoding`
 * attribute, leaving an unrecognized encoding untouched.
 *
 * Mirrors: ActiveSupport::XmlMini._parse_binary (xml_mini.rb:169-178).
 *
 * @internal
 */
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

/**
 * Decode a `type="file"` value into an IO decorated with the element's `name`
 * and `content_type` attributes.
 *
 * Mirrors: ActiveSupport::XmlMini._parse_file (xml_mini.rb:180-186). Copying
 * {@link FileLike}'s descriptors onto the instance is `f.extend(FileLike)` —
 * Ruby's `extend` decorates the object, not its class.
 *
 * @internal
 */
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

/**
 * Decode a hex-encoded value to its bytes.
 *
 * Mirrors: ActiveSupport::XmlMini._parse_hex_binary (xml_mini.rb:188-190) —
 * Ruby's `[bin].pack("H*")`.
 *
 * @internal
 */
export function _parseHexBinary(bin: string): string {
  return Buffer.from(bin, "hex").toString("binary");
}

/**
 * The execution-state-scoped backend override.
 *
 * Mirrors: ActiveSupport::XmlMini#current_thread_backend (xml_mini.rb:192-194).
 *
 * @internal
 */
export function currentThreadBackend(): XmlMiniBackend | null | undefined {
  return IsolatedExecutionState.get("xml_mini_backend");
}

/**
 * Mirrors: ActiveSupport::XmlMini#current_thread_backend= (xml_mini.rb:196-198).
 *
 * @internal
 */
export async function setCurrentThreadBackend(
  name: XmlMiniBackendName | null | undefined,
): Promise<void> {
  IsolatedExecutionState.set(
    "xml_mini_backend",
    name != null ? await castBackendNameToModule(name) : name,
  );
}

/**
 * Every file Ruby's `require "active_support/xml_mini/#{name.downcase}"`
 * (xml_mini.rb:202) can reach, listed here because ESM has no directory
 * `require`: `activesupport/lib/active_support/xml_mini/` holds jdom.rb,
 * libxml.rb, libxmlsax.rb, nokogiri.rb, nokogirisax.rb and rexml.rb. A name
 * maps either to its trails module's loader or — for the three backends trails
 * does not carry, which wrap a JRuby-only DOM (jdom.rb:3) and the libxml-ruby
 * gem (libxml.rb:3, libxmlsax.rb:3) — to the message that Ruby file itself
 * raises, so an unported backend is named in one place instead of being implied
 * by an absent branch. A name with no entry at all raises what Ruby's `require`
 * raises for a missing file.
 *
 * The specifiers are spelled out rather than interpolated: a bundler resolves
 * `import(`./xml-mini/${x}.js`)` by globbing `./xml-mini/*.js`, which matches
 * nothing when the sources on disk are `.ts`, so the name arm threw
 * `Unknown variable dynamic import` under vitest.
 */
const XML_MINI_BACKENDS: Record<string, (() => Promise<unknown>) | string> = {
  jdom: "JRuby is required to use the JDOM backend for XmlMini",
  libxml: "cannot load such file -- libxml",
  libxmlsax: "cannot load such file -- libxml",
  nokogiri: () => import("./xml-mini/nokogiri.js"),
  nokogirisax: () => import("./xml-mini/nokogirisax.js"),
  rexml: () => import("./xml-mini/rexml.js"),
};

/**
 * Resolve a backend name to its module, loading the module the first time.
 *
 * Mirrors: ActiveSupport::XmlMini#cast_backend_name_to_module
 * (xml_mini.rb:200-206) — Ruby's `require
 * "active_support/xml_mini/#{name.downcase}"` plus `const_get "XmlMini_#{name}"`
 * is a dynamic import here, since the module namespace object of
 * `xml-mini/<name>.js` is the backend module.
 *
 * @internal
 */
export async function castBackendNameToModule(name: XmlMiniBackendName): Promise<XmlMiniBackend> {
  if (typeof name !== "string") {
    return name;
  } else {
    const backend = XML_MINI_BACKENDS[name.toLowerCase()];
    if (typeof backend === "function") return (await backend()) as XmlMiniBackend;
    // Ruby's counterpart is the core `LoadError` / `RuntimeError` the file's own
    // `require` or guard raises; there is no Rails error class to port here, the
    // same reason `yaml.ts:16` gives for its own LoadError stand-in.
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(
      backend ?? `cannot load such file -- active_support/xml_mini/${name.toLowerCase()}`,
    );
  }
}

/** Render `attrs` as ` k="v"` pairs with escaped values, in insertion order. */
function attributeString(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([k, v]) => ` ${k}="${htmlEscape(v).toString()}"`)
    .join("");
}

/**
 * Compact XML sink mirroring `Builder::XmlMarkup`'s default (no indentation),
 * escaping text content and attribute values. Used as the `to_tag` builder in
 * parity tests and anywhere a self-contained XML string is wanted.
 */
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

  /** The accumulated XML. Mirrors: `Builder::XmlMarkup#target!`. */
  target(): string {
    return this.buffer;
  }
}

/**
 * A depth-aware XML sink: each tag is emitted on its own line, indented two
 * spaces per open container and terminated by a newline. `openTag`/`closeTag`
 * track nesting so `to_tag`'s `emitHash`/`emitArray` produce the pretty-printed
 * layout ActiveModel's `Model#toXml` emits. Mirrors `Builder::XmlMarkup` with
 * `:indent => 2`.
 */
export class IndentedXmlStringBuilder implements XmlBuilder {
  private buffer = "";
  private depth = 0;

  constructor(private readonly baseIndent = "") {}

  private indent(): string {
    return this.baseIndent + "  ".repeat(this.depth);
  }

  tag(name: string, content?: string | null, attributes: Record<string, string> = {}): void {
    const attrs = attributeString(attributes);
    this.buffer +=
      content == null
        ? `${this.indent()}<${name}${attrs}/>\n`
        : `${this.indent()}<${name}${attrs}>${htmlEscape(content).toString()}</${name}>\n`;
  }

  openTag(name: string, attributes: Record<string, string> = {}): void {
    this.buffer += `${this.indent()}<${name}${attributeString(attributes)}>\n`;
    this.depth += 1;
  }

  closeTag(name: string): void {
    this.depth -= 1;
    this.buffer += `${this.indent()}</${name}>\n`;
  }

  /** The accumulated XML. Mirrors: `Builder::XmlMarkup#target!`. */
  target(): string {
    return this.buffer;
  }
}

/**
 * Mirrors: `XmlMini.backend = "REXML"` (xml_mini.rb:210) — the module-bottom
 * default. {@link setBackend} resolves a name through a dynamic import, which
 * cannot be awaited at module scope, so the default is assigned from the
 * statically-imported module: the same value `castBackendNameToModule("REXML")`
 * returns for `"REXML"`.
 */
_backend = XmlMini_REXML;
