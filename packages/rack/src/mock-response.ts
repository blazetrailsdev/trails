/**
 * @boundary-file: test-only mock parses `Set-Cookie` headers (cookie spec
 *   RFC 6265 / 6265bis) — `Expires` uses a cookie-date and is parsed with
 *   JS `Date` / `Date.parse` semantics; `Max-Age` derives an expiry Date
 *   from `Date.now()`.
 */

import { CGI, fetch, rbFArray, rbStrSNew } from "@blazetrails/ruby-compat";
import { Response } from "./response.js";
import { SET_COOKIE } from "./constants.js";

export class MockResponse extends Response {
  originalHeaders: Record<string, any>;
  cookies: Record<string, InstanceType<typeof CGI.Cookie>>;
  private _errors: any;
  private _bufferedBody: string | undefined;

  constructor(status: number, headers: Record<string, any>, body: any, errors?: any) {
    super(body, status, headers);
    this.originalHeaders = { ...headers };
    this._errors = errors;
    this.cookies = this.parseCookiesFromHeader();
    this.bufferedBodyBang();
  }

  get errors(): string {
    if (this._errors) {
      if (typeof this._errors.string === "function") return this._errors.string();
      if (typeof this._errors === "string") return this._errors;
    }
    return "";
  }

  set errors(value: string) {
    this._errors = value;
  }

  /** @inventedArm if — CONVERGEABLE io-read-length-answers-a-binary-string-where-the-ascii-8bit-seat-is-uint8array */
  override get body(): string {
    if (this._bufferedBody !== undefined) return this._bufferedBody;

    let buffer = (this._bufferedBody = rbStrSNew());

    for (const chunk of this._body) {
      buffer +=
        chunk instanceof Uint8Array
          ? Array.from(chunk, (byte) => String.fromCharCode(byte)).join("")
          : String(chunk);
    }
    this._bufferedBody = buffer;

    return buffer;
  }

  override set body(value: any) {
    this._body = value;
  }

  override isEmpty(): boolean {
    return [201, 204, 304].includes(this.status);
  }

  cookie(name: string): InstanceType<typeof CGI.Cookie> | null {
    return fetch(this.cookies, name, null);
  }

  match(other: RegExp): RegExpMatchArray | null {
    return this.body.match(other);
  }

  /** @internal */
  private parseCookiesFromHeader(): Record<string, InstanceType<typeof CGI.Cookie>> {
    const cookies: Record<string, InstanceType<typeof CGI.Cookie>> = {};
    const setCookieHeader = this.headers[SET_COOKIE];
    if (setCookieHeader && setCookieHeader.length !== 0) {
      for (const cookie of rbFArray(setCookieHeader) as string[]) {
        const i = cookie.indexOf("=");
        const [cookieName, cookieFilling] =
          i === -1 ? [cookie, undefined] : [cookie.slice(0, i), cookie.slice(i + 1)];
        const cookieAttributes = this.identifyCookieAttributes(cookieFilling!);
        const parsedCookie = new CGI.Cookie({
          name: cookieName.trim(),
          value: fetch(cookieAttributes, "value"),
          path: fetch(cookieAttributes, "path", null),
          domain: fetch(cookieAttributes, "domain", null),
          expires: fetch(cookieAttributes, "expires", null),
          secure: fetch(cookieAttributes, "secure", false),
        });
        cookies[cookieName] = parsedCookie;
      }
    }
    return cookies;
  }

  /** @internal */
  private identifyCookieAttributes(cookieFilling: string): Record<string, any> {
    const bits = cookieFilling.split(";");
    const attrs: Record<string, any> = { value: bits[0].trim() };

    for (let i = 1; i < bits.length; i++) {
      const bit = bits[i].trim();
      if (bit.includes("=")) {
        const [k, v] = bit.split("=", 2);
        attrs[k.trim().toLowerCase()] = v.trim();
      }
      if (bit.toLowerCase().includes("secure")) {
        attrs.secure = true;
      }
    }

    if (attrs["max-age"]) {
      attrs.expires = new Date(Date.now() + parseInt(attrs["max-age"], 10) * 1000);
    } else if (attrs.expires) {
      attrs.expires = new Date(attrs.expires);
    }

    return attrs;
  }
}
