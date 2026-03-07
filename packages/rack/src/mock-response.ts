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

  toString(): string { return this.value.join("&"); }
}

export class MockResponse extends Response {
  originalHeaders: Record<string, any>;
  cookies: Record<string, MockCookie>;
  errors: string;
  private _bodyString: string | undefined;

  constructor(status: number, headers: Record<string, any>, body: any, errors?: any) {
    super(body, status, headers);
    this.originalHeaders = { ...headers };
    this.errors = "";
    if (errors) {
      if (typeof errors.string === "function") this.errors = errors.string();
      else if (typeof errors === "string") this.errors = errors;
    }
    this.cookies = this._parseCookiesFromHeader();
    this.bufferedBody();
  }

  get bodyString(): string {
    if (this._bodyString !== undefined) return this._bodyString;
    const chunks: string[] = [];
    if (Array.isArray(this.body)) {
      for (const chunk of this.body) chunks.push(String(chunk));
    }
    this._bodyString = chunks.join("");
    return this._bodyString;
  }

  // Alias for bodyString for compat
  getBody(): string { return this.bodyString; }

  cookie(name: string): MockCookie | undefined {
    return this.cookies[name];
  }

  private _parseCookiesFromHeader(): Record<string, MockCookie> {
    const cookies: Record<string, MockCookie> = {};
    let setCookie = this.headers[SET_COOKIE];
    if (!setCookie) return cookies;
    const cookieHeaders = Array.isArray(setCookie) ? setCookie : [setCookie];

    for (const cookie of cookieHeaders) {
      const eqIdx = cookie.indexOf("=");
      if (eqIdx === -1) continue;
      const name = cookie.substring(0, eqIdx);
      const filling = cookie.substring(eqIdx + 1);
      const bits = filling.split(";");
      const value = [bits[0].trim()];
      const attrs: Record<string, any> = { value };

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
        attrs.expires = new Date(Date.now() + parseInt(attrs["max-age"]) * 1000);
      } else if (attrs.expires) {
        attrs.expires = new Date(attrs.expires);
      }

      cookies[name.trim()] = new MockCookie({
        name: name.trim(),
        value,
        path: attrs.path,
        domain: attrs.domain,
        expires: attrs.expires,
        secure: attrs.secure || false,
      });
    }
    return cookies;
  }
}
