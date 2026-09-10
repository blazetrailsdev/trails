/**
 * @boundary-file: test-only mock parses `Set-Cookie` headers (cookie spec
 *   RFC 6265 / 6265bis) — `Expires` uses a cookie-date and is parsed with
 *   JS `Date` / `Date.parse` semantics; `Max-Age` derives an expiry Date
 *   from `Date.now()`.
 */

import { Response } from "./response.js";
import { SET_COOKIE } from "./constants.js";

export class MockCookie {
  name: string;
  value: string[];
  path?: string;
  domain?: string;
  expires?: Date;
  secure: boolean;

  constructor(args: Record<string, any>) {
    this.name = args.name;
    this.value = args.value;
    this.path = args.path;
    this.domain = args.domain;
    this.expires = args.expires;
    this.secure = args.secure || false;
  }

  toString(): string {
    return this.value.join("&");
  }
}

export class MockResponse extends Response {
  originalHeaders: Record<string, any>;
  cookies: Record<string, MockCookie>;
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

  override get body(): string {
    if (this._bufferedBody !== undefined) return this._bufferedBody;

    let buffer = "";

    for (const chunk of this._body) {
      buffer += String(chunk);
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

  cookie(name: string): MockCookie | undefined {
    return this.cookies[name];
  }

  match(other: RegExp): RegExpMatchArray | null {
    return this.body.match(other);
  }

  /** @internal */
  private parseCookiesFromHeader(): Record<string, MockCookie> {
    const cookies: Record<string, MockCookie> = {};
    const setCookie = this.headers[SET_COOKIE];
    if (!setCookie) return cookies;
    const cookieHeaders = Array.isArray(setCookie) ? setCookie : [setCookie];

    for (const cookie of cookieHeaders) {
      const eqIdx = cookie.indexOf("=");
      if (eqIdx === -1) continue;
      const name = cookie.substring(0, eqIdx);
      const filling = cookie.substring(eqIdx + 1);
      const attrs = this.identifyCookieAttributes(filling);

      cookies[name.trim()] = new MockCookie({
        name: name.trim(),
        value: attrs.value,
        path: attrs.path,
        domain: attrs.domain,
        expires: attrs.expires,
        secure: attrs.secure || false,
      });
    }
    return cookies;
  }

  /** @internal */
  private identifyCookieAttributes(cookieFilling: string): Record<string, any> {
    const bits = cookieFilling.split(";");
    const attrs: Record<string, any> = { value: [bits[0].trim()] };

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
