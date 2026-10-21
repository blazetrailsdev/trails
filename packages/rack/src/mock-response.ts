/**
 * @boundary-file: test-only mock parses `Set-Cookie` headers (cookie spec
 *   RFC 6265 / 6265bis) — `Expires` uses a cookie-date and is parsed with
 *   JS `Date` / `Date.parse` semantics; `Max-Age` derives an expiry Date
 *   from `Date.now()`.
 */

import { Time } from "@blazetrails/date";
import { CGI, fetch, rbFArray, rbObjRespondTo, rbStrToI } from "@blazetrails/ruby-compat";
import { Response } from "./response.js";
import { SET_COOKIE } from "./constants.js";

type Cookie = InstanceType<typeof CGI.Cookie>;

export class MockResponse extends Response {
  originalHeaders: Record<string, any>;
  cookies: Record<string, Cookie>;
  private _errors: any;
  private _bufferedBody: string | undefined;

  constructor(status: number, headers: Record<string, any>, body: any, errors: any = null) {
    super(body, status, headers);
    this.originalHeaders = headers;

    if (errors != null && errors !== false) {
      this._errors = rbObjRespondTo(errors, "string") ? errors : null;
    } else {
      this._errors = "";
    }

    this.cookies = this.parseCookiesFromHeader();
    this.bufferedBodyBang();
  }

  /** @inventedArm if — PERMANENT */
  get errors(): string | null {
    return rbObjRespondTo(this._errors, "string") ? this._errors.string() : this._errors;
  }

  set errors(value: string | null) {
    this._errors = value;
  }

  /** @inventedArm if — CONVERGEABLE io-read-length-answers-a-binary-string-where-the-ascii-8bit-seat-is-uint8array */
  override get body(): string {
    if (this._bufferedBody !== undefined) return this._bufferedBody;

    let buffer = (this._bufferedBody = "");

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

  cookie(name: string): Cookie | null {
    return fetch(this.cookies, name, null);
  }

  match(other: RegExp): RegExpMatchArray | null {
    return this.body.match(other);
  }

  /** @internal */
  private parseCookiesFromHeader(): Record<string, Cookie> {
    const cookies: Record<string, Cookie> = {};
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
    const cookieBits = cookieFilling.split(";");
    const cookieAttributes: Record<string, any> = {};
    cookieAttributes["value"] = cookieBits[0].trim();
    for (const bit of cookieBits.slice(1)) {
      if (bit.includes("=")) {
        const index = bit.indexOf("=");
        const cookieAttribute = bit.slice(0, index);
        const attributeValue = bit.slice(index + 1);
        cookieAttributes[cookieAttribute.trim().toLowerCase()] = attributeValue.trim();
      }
      if (bit.includes("secure")) {
        cookieAttributes["secure"] = true;
      }
    }

    if (Object.hasOwn(cookieAttributes, "max-age")) {
      cookieAttributes["expires"] = Time.now().plus(rbStrToI(cookieAttributes["max-age"]));
    } else if (Object.hasOwn(cookieAttributes, "expires")) {
      cookieAttributes["expires"] = Time.httpdate(cookieAttributes["expires"]);
    }

    return cookieAttributes;
  }
}
