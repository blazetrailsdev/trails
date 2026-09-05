import { Time } from "@blazetrails/date";
import { Utils } from "@blazetrails/rack";
import { regexpEscape } from "@blazetrails/ruby-compat";
import { DEFAULT_HOST } from "./test.js";

/** @internal */
export class Cookie {
  readonly name: string;

  readonly value: string | undefined;

  readonly raw: string;

  /** @internal */
  private readonly _defaultHost: string;

  /** @internal */
  private readonly _options: Record<string, string | string[] | undefined>;

  /** @internal */
  private readonly _exactDomainMatch: boolean;

  constructor(raw: string, uri: URL | null = null, defaultHost: string = DEFAULT_HOST) {
    this._defaultHost = defaultHost;
    uri ??= this.defaultUri();

    this.raw = raw.split(/[;,] */, 2)[0];
    const options = raw.slice(this.raw.length).replace(/^[;,] */, "");

    const first = Object.entries(Utils.parseQuery(this.raw, ";"))[0] as
      | [string, string | null]
      | undefined;
    this.name = first ? first[0] : "";
    this.value = first == null ? undefined : (first[1] ?? undefined);
    this._options = {};
    for (const [k, v] of Object.entries(Utils.parseQuery(options, ";"))) {
      this._options[k.toLowerCase()] = v ?? undefined;
    }

    const domain = this._options["domain"];
    if (domain != null) {
      this._exactDomainMatch = false;
      if (domain[0] === ".") {
        this._options["domain"] =
          typeof domain === "string" ? domain.slice(1) : ["", ...domain.slice(1)];
      }
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

  isEmpty(): boolean {
    return this.value == null || this.value === "";
  }

  domain(): string {
    return this._options["domain"] as string;
  }

  isSecure(): boolean {
    return "secure" in this._options;
  }

  isHttpOnly(): boolean {
    return "httponly" in this._options;
  }

  path(): string {
    const head = [this._options["path"] ?? "/"].flat()[0].split(",")[0];
    return (head === "" ? "/" : head).trim();
  }

  expires(): Time | undefined {
    const expires = this._options["expires"];
    return expires == null ? undefined : Time.parse(expires as string);
  }

  isExpired(): boolean {
    const expires = this.expires();
    return expires != null && (expires.minus(Time.now()) as number) < 0;
  }

  isValid(uri: URL | null): boolean {
    uri ??= this.defaultUri();

    if (uri.hostname === "") uri.hostname = this._defaultHost;

    const pattern = new RegExp(
      `${this._exactDomainMatch ? "^" : ""}${regexpEscape(this.domain())}$`,
      "i",
    );
    return (
      (!this.isSecure() || (this.isSecure() && uri.protocol === "https:")) &&
      pattern.test(uri.hostname)
    );
  }

  matches(uri: URL): boolean {
    return !this.isExpired() && this.isValid(uri) && uri.pathname.startsWith(this.path());
  }

  spaceship(other: Cookie): number {
    return compare(
      [this.name, this.path(), reverseString(this.domain())],
      [other.name, other.path(), reverseString(other.domain())],
    );
  }

  toH(): Record<string, string | string[] | boolean | undefined> {
    const hash: Record<string, string | string[] | boolean | undefined> = {
      ...this._options,
      value: this.value,
      HttpOnly: this.isHttpOnly(),
      secure: this.isSecure(),
    };
    delete hash["httponly"];
    return hash;
  }

  toHash(): Record<string, string | string[] | boolean | undefined> {
    return this.toH();
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
  private _defaultHost: string;

  /** @internal */
  private _cookies: Cookie[];

  constructor(cookies: Cookie[] = [], defaultHost: string = DEFAULT_HOST) {
    this._defaultHost = defaultHost;
    this._cookies = cookies.sort((a, b) => a.spaceship(b));
  }

  initializeCopy(other: CookieJar): this {
    this._defaultHost = other._defaultHost;
    this._cookies = other._cookies.slice();
    return this;
  }

  get(name: string): string | undefined {
    name = String(name);
    for (const cookie of this._cookies) {
      if (cookie.name === name) return cookie.value;
    }
    return undefined;
  }

  set(name: string, value: string): void {
    this.merge(`${name}=${Utils.escape(value)}`);
  }

  getCookie(name: string): Cookie | undefined {
    for (const cookie of this._cookies) {
      if (cookie.name === name) return cookie;
    }
    return undefined;
  }

  delete(name: string): void {
    this._cookies = this._cookies.filter((cookie) => cookie.name !== name);
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
function compare(a: string[], b: string[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}
