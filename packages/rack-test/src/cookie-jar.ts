import { Utils } from "@blazetrails/rack";
import { DEFAULT_HOST } from "./test.js";

/** @internal */
export class Cookie {
  readonly name: string;

  readonly value: string | undefined;

  readonly raw: string;

  /** @internal */
  private readonly _defaultHost: string;

  /** @internal */
  private readonly _options: Record<string, string | undefined>;

  /** @internal */
  private readonly _exactDomainMatch: boolean;

  constructor(raw: string, uri: URL | null = null, defaultHost: string = DEFAULT_HOST) {
    this._defaultHost = defaultHost;
    uri ??= this.defaultUri();

    const split = raw.split(/[;,] */, 2);
    this.raw = split[0];
    const options = raw.slice(this.raw.length).replace(/^[;,] */, "");

    const first = Object.entries(Utils.parseQuery(this.raw, ";"))[0] as
      | [string, string | string[] | null]
      | undefined;
    this.name = first ? first[0] : "";
    this.value = first == null || first[1] == null ? undefined : String(first[1]);
    this._options = {};
    for (const [k, v] of Object.entries(Utils.parseQuery(options, ";"))) {
      this._options[k.toLowerCase()] = v == null ? undefined : String(v);
    }

    let domain = this._options["domain"];
    if (domain != null) {
      this._exactDomainMatch = false;
      if (domain[0] === ".") domain = domain.slice(1);
      this._options["domain"] = domain;
    } else {
      this._exactDomainMatch = true;
      this._options["domain"] = uri.hostname || defaultHost;
    }

    this._options["path"] ??= uri.pathname.replace(/\/[^/]*$/, "");
  }

  replaces(other: Cookie): boolean {
    return (
      this.name.toLowerCase() === other.name.toLowerCase() &&
      this.domain() === other.domain() &&
      this.path() === other.path()
    );
  }

  domain(): string {
    return this._options["domain"]!;
  }

  isSecure(): boolean {
    return "secure" in this._options;
  }

  path(): string {
    return (this._options["path"] ?? "/").split(",")[0].trim() || "/";
  }

  expires(): Date | undefined {
    const expires = this._options["expires"];
    return expires == null ? undefined : new Date(expires);
  }

  isExpired(): boolean {
    const expires = this.expires();
    return expires != null && expires.getTime() < Date.now();
  }

  isValid(uri: URL | null): boolean {
    uri ??= this.defaultUri();
    const host = uri.hostname || this._defaultHost;
    const pattern = new RegExp(
      `${this._exactDomainMatch ? "^" : ""}${escapeRegexp(this.domain())}$`,
      "i",
    );
    return (!this.isSecure() || uri.protocol === "https:") && pattern.test(host);
  }

  matches(uri: URL | null): boolean {
    return !this.isExpired() && this.isValid(uri) && (uri?.pathname ?? "/").startsWith(this.path());
  }

  spaceship(other: Cookie): number {
    return compare(
      [this.name, this.path(), reverseString(this.domain())],
      [other.name, other.path(), reverseString(other.domain())],
    );
  }

  /** @internal */
  private defaultUri(): URL {
    return new URL(`http://${this._defaultHost}/`);
  }
}

/** @internal */
export class CookieJar {
  static readonly DELIMITER = "; ";

  /** @internal */
  private readonly _defaultHost: string;

  /** @internal */
  private _cookies: Cookie[];

  constructor(cookies: Cookie[] = [], defaultHost: string = DEFAULT_HOST) {
    this._defaultHost = defaultHost;
    this._cookies = cookies.sort((a, b) => a.spaceship(b));
  }

  get(name: string): string | undefined {
    for (const cookie of this._cookies) {
      if (cookie.name === name) return cookie.value;
    }
    return undefined;
  }

  set(name: string, value: string): void {
    this.merge(`${name}=${Utils.escape(value)}`);
  }

  merge(rawCookies: string | string[] | null | undefined, uri: URL | null = null): void {
    if (rawCookies == null) return;

    const cookies = typeof rawCookies === "string" ? rawCookies.split("\n") : rawCookies;

    for (const rawCookie of cookies) {
      if (rawCookie === "") continue;
      const cookie = new Cookie(rawCookie, uri, this._defaultHost);
      if (cookie.isValid(uri)) this.push(cookie);
    }
  }

  push(newCookie: Cookie): void {
    this._cookies = this._cookies.filter((existingCookie) => !newCookie.replaces(existingCookie));
    this._cookies.push(newCookie);
    this._cookies.sort((a, b) => a.spaceship(b));
  }

  for(uri: URL | null): string {
    let buf = "";
    let delimiter: string | undefined;

    this.eachCookieFor(uri, (cookie) => {
      if (delimiter != null) buf += delimiter;
      else delimiter = CookieJar.DELIMITER;
      buf += cookie.raw;
    });

    return buf;
  }

  toHash(): Record<string, string | undefined> {
    const cookies: Record<string, string | undefined> = {};
    for (const cookie of this._cookies) cookies[cookie.name] = cookie.value;
    return cookies;
  }

  /** @internal */
  private eachCookieFor(uri: URL | null, block: (cookie: Cookie) => void): void {
    for (const cookie of this._cookies) {
      if (!uri || cookie.matches(uri)) block(cookie);
    }
  }
}

/** @internal */
function reverseString(value: string): string {
  return [...value].reverse().join("");
}

/** @internal */
function escapeRegexp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** @internal */
function compare(a: string[], b: string[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}
