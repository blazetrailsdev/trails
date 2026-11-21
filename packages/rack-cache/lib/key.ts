import { escape, unescape } from "@blazetrails/rack";
import { sort, stringSplit } from "@blazetrails/ruby-compat";
import { reject } from "@blazetrails/ruby-compat/enumerable";
import type { Request } from "./request.js";

type QueryStringIgnore = (k: string, v: string | undefined) => unknown;

export class Key {
  static queryStringIgnore: QueryStringIgnore | null = null;

  /** @internal */
  private _request: Request;

  static call(request: Request): string {
    return new this(request).generate();
  }

  constructor(request: Request) {
    this._request = request;
  }

  generate(): string {
    const parts: unknown[] = [];
    parts.push(this._request.scheme, "://");
    parts.push(this._request.host);

    if (
      (this._request.scheme === "https" && this._request.port !== 443) ||
      (this._request.scheme === "http" && this._request.port !== 80)
    ) {
      parts.push(":", String(this._request.port));
    }

    parts.push(this._request.scriptName);
    parts.push(this._request.pathInfo);

    const qs = this.queryString();
    if (qs != null) {
      parts.push("?");
      parts.push(qs);
    }

    return parts.join("");
  }

  /** @internal */
  private queryString(): string | null {
    if (String(this._request.queryString ?? "").length === 0) return null;

    let parts: string[][] = stringSplit(this._request.queryString, /[&;] */).map((p) =>
      stringSplit(p, "=", 2).map((s) => unescape(s)),
    );
    parts = sort(parts);
    parts = reject<string[]>(
      parts,
      ((this.constructor as typeof Key).queryStringIgnore ?? undefined) as
        | ((part: string[]) => unknown)
        | undefined,
    );
    const pairs = parts.map(([k, v]) => `${escape(k)}=${escape(v)}`);
    return pairs.length === 0 ? null : pairs.join("&");
  }
}
