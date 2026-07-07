import { camelize, singularize } from "./inflector.js";
import { htmlEscape } from "./core-ext/string/output-safety.js";
import { BigDecimal } from "./core-ext/big-decimal/conversions.js";
import { Temporal } from "./temporal.js";

export interface RenameKeyOptions {
  /** Convert `snake_case` keys to `dashed-keys`. Defaults to `true`. */
  dasherize?: boolean;
  /** Camelize the key first: `true`/`"upper"` for UpperCamel, `"lower"` for lowerCamel. */
  camelize?: boolean | "lower" | "upper";
}

/**
 * Dasherize an `underscore_key`, preserving any leading/trailing underscores.
 *
 * Mirrors: ActiveSupport::XmlMini._dasherize — the `$2` (interior) capture is
 * non-greedy so surrounding runs of underscores are left untouched and only the
 * interior `_`/space characters become `-`.
 */
function underscoreToDash(key: string): string {
  const match = /^(_*)([\s\S]*?)(_*)$/.exec(key.trim());
  if (!match) return key;
  const [, left, middle, right] = match;
  return `${left}${middle.replace(/[_ ]/g, "-")}${right}`;
}

/**
 * Apply the `camelize`/`dasherize` key transforms to a single XML tag name.
 *
 * Mirrors: ActiveSupport::XmlMini.rename_key — camelize (when requested) runs
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
    result = underscoreToDash(result);
  }
  return result;
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

export interface ToTagOptions extends RenameKeyOptions {
  /** The sink the emitted tag(s) are written to. */
  builder: XmlBuilder;
  /** Explicit `type=` name; suppresses runtime type inference when set. */
  type?: string;
  /** Suppress the inferred `type=` attribute (any truthy value, per Rails). */
  skipTypes?: boolean | number;
  /** Overrides `DEFAULT_ENCODINGS[type]` for the `encoding=` attribute. */
  encoding?: string;
  /** Set by `to_tag` when recursing; the tag name passed to nested `toXml`. */
  root?: unknown;
  /** Always true once inside `to_tag` (no XML instruction on nested docs). */
  skipInstruct?: boolean;
}

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
};

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

  const renamed = renameKey(keyToString(key), options);
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
 * Mirrors: Array#to_xml (conversions.rb:200-207) — the root is renamed first,
 * then the child name is `root.singularize` of the *renamed* root, so a
 * `camelize`/`dasherize` root propagates to the children. `toTag` renames each
 * child again, matching Rails' `to_tag(children, value, options)`.
 */
function emitArray(key: unknown, values: unknown[], options: ToTagOptions): void {
  const root = renameKey(keyToString(key), options);
  options.builder.openTag(root, options.skipTypes ? {} : { type: "array" });
  const children = singularize(root);
  for (const item of values) {
    toTag(children, item, { ...options, type: undefined, root: children });
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
  const root = renameKey(keyToString(key), options);
  options.builder.openTag(root, {});
  for (const [k, v] of Object.entries(hash)) {
    toTag(k, v, { ...options, type: undefined, root: k });
  }
  options.builder.closeTag(root);
}

/**
 * Compact XML sink mirroring `Builder::XmlMarkup`'s default (no indentation),
 * escaping text content and attribute values. Used as the `to_tag` builder in
 * parity tests and anywhere a self-contained XML string is wanted.
 */
export class XmlStringBuilder implements XmlBuilder {
  private buffer = "";

  private attributeString(attributes: Record<string, string>): string {
    return Object.entries(attributes)
      .map(([k, v]) => ` ${k}="${htmlEscape(v).toString()}"`)
      .join("");
  }

  tag(name: string, content?: string | null, attributes: Record<string, string> = {}): void {
    const attrs = this.attributeString(attributes);
    if (content == null) {
      this.buffer += `<${name}${attrs}/>`;
    } else {
      this.buffer += `<${name}${attrs}>${htmlEscape(content).toString()}</${name}>`;
    }
  }

  openTag(name: string, attributes: Record<string, string> = {}): void {
    this.buffer += `<${name}${this.attributeString(attributes)}>`;
  }

  closeTag(name: string): void {
    this.buffer += `</${name}>`;
  }

  /** The accumulated XML. Mirrors: `Builder::XmlMarkup#target!`. */
  target(): string {
    return this.buffer;
  }
}
