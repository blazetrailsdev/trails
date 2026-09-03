import { ArrayInquirer } from "@blazetrails/activesupport";
import { BadRequest } from "../../action-controller/metal/exceptions.js";
import { MimeType } from "./mime-type.js";
import { ParseError } from "./parameters.js";
import { ArgumentError } from "@blazetrails/ruby-compat";

/** @internal */
const RESCUABLE_MIME_FORMAT_ERRORS = [BadRequest, ParseError] as const;

export class InvalidType extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ActionDispatch::Http::MimeNegotiation::InvalidType";
  }
}

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

export interface MimeNegotiationHost {
  getHeader(key: string): unknown;
  setHeader(key: string, value: unknown): unknown;
  fetchHeader<T>(key: string, fallback: (key: string) => T): unknown | T;
  parameters: Record<string, unknown>;
  accept: string;
  xhr: boolean;
}

export class MimeNegotiation {
  declare setHeader: MimeNegotiationHost["setHeader"];
  declare parameters: MimeNegotiationHost["parameters"];
  /** @internal */
  declare _variant?: ArrayInquirer<string> & Record<string, () => boolean>;

  static ignoreAcceptHeader = false;

  set variant(value: string | string[] | null | undefined) {
    const arr = Array.isArray(value) ? value : value == null ? [] : [value];
    if (!arr.every((v) => typeof v === "string")) {
      throw new ArgumentError("request.variant must be set to a Symbol or an Array of Symbols.");
    }
    this._variant = new ArrayInquirer<string>(...arr) as ArrayInquirer<string> &
      Record<string, () => boolean>;
  }

  set format(extension: unknown) {
    this.parameters["format"] = extension == null ? "" : String(extension);
    this.setHeader("action_dispatch.request.formats", [
      MimeType.lookupByExtension(this.parameters["format"] as string),
    ]);
  }

  set formats(extensions: unknown[]) {
    this.parameters["format"] = extensions[0] == null ? "" : String(extensions[0]);
    this.setHeader(
      "action_dispatch.request.formats",
      extensions.map((ext) => MimeType.lookupByExtension(String(ext))),
    );
  }
}

const BROWSER_LIKE_ACCEPTS = /,\s*\*\/\*|\*\/\*\s*,/;

export function contentMimeType(this: MimeNegotiationHost): MimeType | null {
  return this.fetchHeader("action_dispatch.request.content_type", (k) => {
    try {
      const match = (this.getHeader("CONTENT_TYPE") as string | undefined)?.match(/^([^,;]*)/);
      const v = match ? MimeType.lookup(match[1].trim().toLowerCase()) : null;
      return this.setHeader(k, v);
    } catch (e) {
      throw new InvalidType((e as Error).message);
    }
  }) as MimeType | null;
}

/** @internal */
export function hasContentType(this: MimeNegotiationHost): boolean {
  return this.getHeader("CONTENT_TYPE") != null;
}

export function accepts(this: MimeNegotiationHost): MimeType[] {
  return this.fetchHeader("action_dispatch.request.accepts", (k) => {
    try {
      const header = String(this.getHeader("HTTP_ACCEPT") ?? "").trim();
      const v: MimeType[] =
        header === "" ? ([contentMimeType.call(this)] as MimeType[]) : MimeType.parse(header);
      return this.setHeader(k, v);
    } catch (e) {
      throw new InvalidType((e as Error).message);
    }
  }) as MimeType[];
}

export function format(this: MimeNegotiationHost, _viewPath?: unknown): MimeType | NullType {
  return formats.call(this)[0] ?? NullType.instance;
}

export function formats(this: MimeNegotiationHost): MimeType[] {
  return this.fetchHeader("action_dispatch.request.formats", (k) => {
    let v: MimeType[];
    let extType: MimeType | undefined;
    if (paramsReadable.call(this)) {
      const f = this.parameters["format"];
      const found = f != null ? MimeType.lookupByExtension(String(f)) : undefined;
      v = found ? [found] : [];
    } else if (useAcceptHeader.call(this) && validAcceptHeader.call(this)) {
      v = [...accepts.call(this)];
    } else if ((extType = formatFromPathExtension.call(this))) {
      v = [extType];
    } else if (this.xhr) {
      const js = MimeType.lookupByExtension("js");
      v = js ? [js] : [];
    } else {
      const html = MimeType.lookupByExtension("html");
      v = html ? [html] : [];
    }
    v = v.filter((f) => f.symbol || f.ref() === "*/*");
    return this.setHeader(k, v);
  }) as MimeType[];
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
  return !MimeNegotiation.ignoreAcceptHeader;
}

/** @internal */
export function formatFromPathExtension(this: MimeNegotiationHost): MimeType | undefined {
  const path =
    (this.getHeader("action_dispatch.original_path") as string | undefined) ||
    (this.getHeader("PATH_INFO") as string | undefined);
  const match = path && path.match(/\.(\w+)$/);
  if (match) return MimeType.lookupByExtension(match[1]);
  return undefined;
}
