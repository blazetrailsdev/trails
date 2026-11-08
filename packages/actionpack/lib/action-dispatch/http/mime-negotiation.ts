import { ArrayInquirer, included, mattrAccessor } from "@blazetrails/activesupport";
import { BadRequest } from "../../action-controller/metal/exceptions.js";
import { MimeType, NullType } from "./mime-type.js";
import { ParseError } from "./parameters.js";
import { ArgumentError, rbEqual } from "@blazetrails/ruby-compat";
import { ActionDispatch } from "../../namespaces.js";

/** @internal */
const RESCUABLE_MIME_FORMAT_ERRORS = [BadRequest, ParseError] as const;

export class InvalidType extends MimeType.InvalidMimeType {}

export class MimeNegotiation {
  declare protected getHeader: (key: string) => unknown;
  declare protected setHeader: (key: string, value: unknown) => unknown;
  declare protected fetchHeader: <T>(key: string, fallback: (key: string) => T) => unknown;
  declare protected parameters: Record<string, unknown>;
  declare protected accept: string | undefined;
  declare protected isXhr: () => boolean;
  /** @internal */
  declare _variant?: ArrayInquirer<string> & Record<string, () => boolean>;

  static [included](base: object): void {
    mattrAccessor.call(base, "ignoreAcceptHeader", { default: false });
  }

  /** @missingRailsName downcase — PERMANENT */
  get contentMimeType(): MimeType | null {
    return this.fetchHeader("action_dispatch.request.content_type", (k) => {
      try {
        const match = (this.getHeader("CONTENT_TYPE") as string | undefined)?.match(/^([^,;]*)/);
        const v = match ? MimeType.lookup(match[1].trim().toLowerCase()) : null;
        return this.setHeader(k, v);
      } catch (e) {
        if (!(e instanceof MimeType.InvalidMimeType)) throw e;
        throw new InvalidType(e.message);
      }
    }) as MimeType | null;
  }

  /** @internal */
  hasContentType(): unknown {
    return this.getHeader("CONTENT_TYPE");
  }

  get accepts(): MimeType[] {
    return this.fetchHeader("action_dispatch.request.accepts", (k) => {
      try {
        const header = String(this.getHeader("HTTP_ACCEPT") ?? "").trim();
        const v: MimeType[] =
          header === "" ? ([this.contentMimeType] as MimeType[]) : MimeType.parse(header);
        return this.setHeader(k, v);
      } catch (e) {
        if (!(e instanceof MimeType.InvalidMimeType)) throw e;
        throw new InvalidType(e.message);
      }
    }) as MimeType[];
  }

  get formats(): MimeType[] {
    return this.fetchHeader("action_dispatch.request.formats", (k) => {
      let v: MimeType[];
      let extType: MimeType | undefined;
      if (this.isParamsReadable()) {
        const f = this.parameters["format"];
        const found = f != null ? MimeType.lookupByExtension(String(f)) : undefined;
        v = found ? [found] : [];
      } else if (this.useAcceptHeader() && this.validAcceptHeader()) {
        v = [...this.accepts];
      } else if ((extType = this.formatFromPathExtension())) {
        v = [extType];
      } else if (this.isXhr()) {
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

  set variant(value: string | string[] | null | undefined) {
    const arr = Array.isArray(value) ? value : value == null ? [] : [value];
    if (!arr.every((v) => typeof v === "string")) {
      throw new ArgumentError("request.variant must be set to a Symbol or an Array of Symbols.");
    }
    this._variant = new ArrayInquirer<string>(...arr) as ArrayInquirer<string> &
      Record<string, () => boolean>;
  }

  get variant(): ArrayInquirer<string> & Record<string, () => boolean> {
    return (this._variant ??= new ArrayInquirer<string>() as ArrayInquirer<string> &
      Record<string, () => boolean>);
  }

  get format(): (_viewPath?: unknown) => MimeType | NullType {
    return format;
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

  negotiateMime(order: (MimeType | undefined)[]): MimeType | NullType | null {
    for (const priority of this.formats) {
      if (rbEqual(priority, MimeType.ALL)) {
        return order[0] ?? null;
      } else if (order.some((o) => rbEqual(o, priority))) {
        return priority;
      }
    }
    return order.some((o) => rbEqual(o, MimeType.ALL)) ? format.call(this) : null;
  }

  /** @internal */
  shouldApplyVaryHeader(): boolean {
    return !this.isParamsReadable() && this.useAcceptHeader() && this.validAcceptHeader();
  }

  /** @internal */
  isParamsReadable(): boolean {
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
  validAcceptHeader(): boolean {
    const a = this.accept;
    const present = a != null && a !== "";
    return (
      (this.isXhr() && (present || this.contentMimeType != null)) ||
      (present && !BROWSER_LIKE_ACCEPTS.test(a))
    );
  }

  /** @internal */
  useAcceptHeader(): boolean {
    return !(this.constructor as { ignoreAcceptHeader?: boolean }).ignoreAcceptHeader;
  }

  /** @internal */
  formatFromPathExtension(): MimeType | undefined {
    const path =
      (this.getHeader("action_dispatch.original_path") as string | undefined) ||
      (this.getHeader("PATH_INFO") as string | undefined);
    const match = path && path.match(/\.(\w+)$/);
    if (match) return MimeType.lookupByExtension(match[1]);
    return undefined;
  }
}

function format(this: MimeNegotiation, _viewPath?: unknown): MimeType | NullType {
  return this.formats[0] ?? NullType.instance;
}

const BROWSER_LIKE_ACCEPTS = /,\s*\*\/\*|\*\/\*\s*,/;

ActionDispatch.Http.MimeNegotiation = MimeNegotiation;
