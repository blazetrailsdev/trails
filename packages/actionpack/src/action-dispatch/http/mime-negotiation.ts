/**
 * ActionDispatch::Http::MimeNegotiation
 *
 * Port of `actionpack/lib/action_dispatch/http/mime_negotiation.rb`. Provides
 * the content-type / accept-header negotiation helpers that Rails mixes into
 * `ActionDispatch::Request` via `extend ActiveSupport::Concern`.
 *
 * Exposed as `this`-typed functions per the mixin convention in CLAUDE.md so
 * the same code lives in the file matching Rails' layout while being assigned
 * directly onto the host class.
 */

import { ArrayInquirer } from "@blazetrails/activesupport";
import { BadRequest } from "../../action-controller/metal/exceptions.js";
import { MimeType } from "./mime-type.js";
import { ParseError } from "./parameters.js";

/**
 * Rails: `RESCUABLE_MIME_FORMAT_ERRORS = [ActionController::BadRequest,
 * ActionDispatch::Http::Parameters::ParseError]`. Anything else thrown from
 * `parameters` should propagate.
 * @internal
 */
const RESCUABLE_MIME_FORMAT_ERRORS = [BadRequest, ParseError] as const;

const CONTENT_TYPE_KEY = "action_dispatch.request.content_type";
const ACCEPTS_KEY = "action_dispatch.request.accepts";
const FORMATS_KEY = "action_dispatch.request.formats";

/**
 * Raised when a `Content-Type` or `Accept` header cannot be parsed as a
 * valid MIME type. Mirrors `ActionDispatch::Http::MimeNegotiation::InvalidType`,
 * which inherits from `Mime::Type::InvalidMimeType` in Rails.
 */
export class InvalidType extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ActionDispatch::Http::MimeNegotiation::InvalidType";
  }
}

/**
 * Singleton returned by {@link format} when no format can be derived.
 * Mirrors `Mime::NullType.instance`: stringifies to "" and reports `symbol`/`ref`
 * as null so callers can branch on absence without nil-checking the receiver.
 */
export class NullType {
  static readonly instance = new NullType();
  readonly symbol: string | null = null;
  readonly string = "";
  ref(): string | null {
    return null;
  }
  toString(): string {
    return "";
  }
}

/**
 * Minimal host surface required by the {@link MimeNegotiation} mixin
 * functions. Mirrors what Rails' `Http::MimeNegotiation` calls on `self`.
 */
export interface MimeNegotiationHost {
  getHeader(key: string): unknown;
  setHeader(key: string, value: unknown): unknown;
  parameters: Record<string, unknown>;
  /** Equivalent to `request.accept`: the raw `HTTP_ACCEPT` value (or ""). */
  accept: string;
  /** True for XHR / `HTTP_X_REQUESTED_WITH: xmlhttprequest`. */
  xhr: boolean;
}

/**
 * Class-level "ignore Accept header" flag. Mirrors Rails'
 * `mattr_accessor :ignore_accept_header, default: false` declared inside
 * `included do … end` and exposed via `Request.ignore_accept_header`.
 */
let _ignoreAcceptHeader = false;

export function ignoreAcceptHeader(): boolean {
  return _ignoreAcceptHeader;
}

export function setIgnoreAcceptHeader(value: boolean): void {
  _ignoreAcceptHeader = value;
}

// We use normal content negotiation unless you include `*/*` in your list, in
// which case we assume you're a browser and send HTML.
const BROWSER_LIKE_ACCEPTS = /,\s*\*\/\*|\*\/\*\s*,/;

/** The MIME type of the HTTP request (parsed from `CONTENT_TYPE`). */
export function contentMimeType(this: MimeNegotiationHost): MimeType | null {
  const cached = this.getHeader(CONTENT_TYPE_KEY);
  if (cached !== undefined) return cached as MimeType | null;
  const raw = this.getHeader("CONTENT_TYPE") as string | undefined;
  try {
    let v: MimeType | null = null;
    if (raw) {
      const match = raw.match(/^([^,;]*)/);
      if (match) v = MimeType.lookup(match[1].trim().toLowerCase()) ?? null;
    }
    this.setHeader(CONTENT_TYPE_KEY, v);
    return v;
  } catch (e) {
    throw new InvalidType((e as Error).message);
  }
}

/** @internal */
export function hasContentType(this: MimeNegotiationHost): boolean {
  return this.getHeader("CONTENT_TYPE") != null;
}

/** Accepted MIME types parsed from `HTTP_ACCEPT`. */
export function accepts(this: MimeNegotiationHost): MimeType[] {
  const cached = this.getHeader(ACCEPTS_KEY);
  if (cached !== undefined) return cached as MimeType[];
  const header = String(this.getHeader("HTTP_ACCEPT") ?? "").trim();
  try {
    const ct = contentMimeType.call(this);
    // Rails: `[content_mime_type]` — array of one element even when nil. The
    // subsequent `validAcceptHeader` gate prevents `accepts` from being used in
    // the all-blank branch, so a `[null]` payload never reaches the formats
    // filter. Kept verbatim for parity with `fetch_header` cache semantics.
    const v: MimeType[] = header === "" ? ([ct] as MimeType[]) : MimeType.parse(header);
    this.setHeader(ACCEPTS_KEY, v);
    return v;
  } catch (e) {
    throw new InvalidType((e as Error).message);
  }
}

/**
 * The MIME type for the format used in the request.
 *
 *     GET /posts/5.xml   | request.format => Mime[:xml]
 *     GET /posts/5.xhtml | request.format => Mime[:html]
 *     GET /posts/5       | request.format => Mime[:html] or Mime[:js], or request.accepts.first
 */
export function format(this: MimeNegotiationHost, _viewPath?: unknown): MimeType | NullType {
  return formats.call(this)[0] ?? NullType.instance;
}

export function formats(this: MimeNegotiationHost): MimeType[] {
  const cached = this.getHeader(FORMATS_KEY);
  if (cached !== undefined) return cached as MimeType[];
  let v: MimeType[];
  let extType: MimeType | undefined;
  if (paramsReadable.call(this)) {
    const f = this.parameters["format"];
    const found = f != null ? MimeType.lookup(String(f)) : undefined;
    v = found ? [found] : [];
  } else if (useAcceptHeader.call(this) && validAcceptHeader.call(this)) {
    v = [...accepts.call(this)];
  } else if ((extType = formatFromPathExtension.call(this))) {
    v = [extType];
  } else if (this.xhr) {
    const js = MimeType.lookup("js");
    v = js ? [js] : [];
  } else {
    const html = MimeType.lookup("html");
    v = html ? [html] : [];
  }
  v = v.filter((f) => f.symbol || f.ref() === "*/*");
  this.setHeader(FORMATS_KEY, v);
  return v;
}

/**
 * Sets the variant for template. Mirrors Rails' `variant=`:
 *
 *     def variant=(variant)
 *       variant = Array(variant)
 *       if variant.all?(Symbol)
 *         @variant = ActiveSupport::ArrayInquirer.new(variant)
 *       else
 *         raise ArgumentError, "request.variant must be set to a Symbol or an Array of Symbols."
 *       end
 *     end
 *
 * Ruby Symbols are represented as plain strings in this codebase (the same
 * convention used elsewhere for symbol-keyed Rails APIs). `ArrayInquirer`'s
 * predicate access (`variant.phone?`) is keyed by string property names, so
 * narrowing to strings keeps `variant.phone()` and `variant.any("phone")`
 * consistent — accepting raw JS `symbol` values here would store an entry
 * that the proxy cannot match by property name.
 */
export function setVariant(
  this: MimeNegotiationHost,
  variant: string | string[] | null | undefined,
): void {
  const arr = Array.isArray(variant) ? variant : variant == null ? [] : [variant];
  if (!arr.every((v) => typeof v === "string")) {
    throw new Error("request.variant must be set to a Symbol or an Array of Symbols.");
  }
  (
    this as MimeNegotiationHost & {
      _variant?: ArrayInquirer<string> & Record<string, () => boolean>;
    }
  )._variant = new ArrayInquirer<string>(...arr) as ArrayInquirer<string> &
    Record<string, () => boolean>;
}

export function variant(
  this: MimeNegotiationHost,
): ArrayInquirer<string> & Record<string, () => boolean> {
  const host = this as MimeNegotiationHost & {
    _variant?: ArrayInquirer<string> & Record<string, () => boolean>;
  };
  return (host._variant ??= new ArrayInquirer<string>() as ArrayInquirer<string> &
    Record<string, () => boolean>);
}

/** Sets the format by string extension (`request.format = :iphone`). */
export function setFormat(this: MimeNegotiationHost, extension: unknown): void {
  this.parameters["format"] = extension == null ? "" : String(extension);
  this.setHeader(FORMATS_KEY, [MimeType.lookupByExtension(this.parameters["format"] as string)]);
}

/** Sets the formats by string extensions (multiple, ordered, with fallback). */
export function setFormats(this: MimeNegotiationHost, extensions: unknown[]): void {
  this.parameters["format"] = extensions[0] == null ? "" : String(extensions[0]);
  this.setHeader(
    FORMATS_KEY,
    extensions.map((ext) => MimeType.lookupByExtension(String(ext))),
  );
}

/** Returns the first MIME type that matches the provided array of MIME types. */
export function negotiateMime(
  this: MimeNegotiationHost,
  order: MimeType[],
): MimeType | NullType | null {
  const isAll = (m: MimeType): boolean => m.string === "*/*";
  for (const priority of formats.call(this)) {
    if (isAll(priority)) {
      return order[0] ?? null;
    } else if (order.some((o) => o.equals(priority))) {
      return priority;
    }
  }
  return order.some(isAll) ? format.call(this) : null;
}

/** @internal */
export function shouldApplyVaryHeader(this: MimeNegotiationHost): boolean {
  return !paramsReadable.call(this) && useAcceptHeader.call(this) && validAcceptHeader.call(this);
}

/** @internal */
export function paramsReadable(this: MimeNegotiationHost): boolean {
  try {
    return this.parameters["format"] != null;
  } catch (err) {
    if (RESCUABLE_MIME_FORMAT_ERRORS.some((cls) => err instanceof cls)) {
      return false;
    }
    throw err;
  }
}

/** @internal */
export function validAcceptHeader(this: MimeNegotiationHost): boolean {
  const a = this.accept;
  const present = a != null && a !== "";
  return (
    (this.xhr && (present || contentMimeType.call(this) != null)) ||
    (present && !BROWSER_LIKE_ACCEPTS.test(a))
  );
}

/** @internal */
export function useAcceptHeader(this: MimeNegotiationHost): boolean {
  return !ignoreAcceptHeader();
}

/** @internal */
export function formatFromPathExtension(this: MimeNegotiationHost): MimeType | undefined {
  const path =
    (this.getHeader("action_dispatch.original_path") as string | undefined) ||
    (this.getHeader("PATH_INFO") as string | undefined);
  const match = path && path.match(/\.(\w+)$/);
  if (match) return MimeType.lookup(match[1]);
  return undefined;
}
