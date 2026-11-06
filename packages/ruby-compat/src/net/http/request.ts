import { ArgumentError } from "../../argument-error.js";
import type { HTTP as URIHTTP } from "../../uri/http.js";

/**
 * `Net::HTTPRequest` (`vendor/ruby/v3.3.11/lib/net/http/request.rb:40`), with the
 * part of `Net::HTTPGenericRequest#initialize`
 * (`vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:15-55`) and `HTTPHeader`
 * that `Net::HTTP#post` reaches.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class HTTPRequest {
  /** @noRailsEquivalent PERMANENT */
  static readonly METHOD: string;
  /** @noRailsEquivalent PERMANENT */
  static readonly REQUEST_HAS_BODY: boolean;
  /** @noRailsEquivalent PERMANENT */
  static readonly RESPONSE_HAS_BODY: boolean;

  /** @noRailsEquivalent PERMANENT */
  readonly method: string;
  /** @noRailsEquivalent PERMANENT */
  readonly path: string;
  /** @noRailsEquivalent PERMANENT */
  readonly uri: URIHTTP | null = null;
  /** @noRailsEquivalent PERMANENT */
  body: string | Uint8Array | null = null;
  private readonly _header: Record<string, string> = {};
  private readonly _responseHasBody: boolean;

  /** @noRailsEquivalent PERMANENT */
  constructor(path: string | URIHTTP, initheader: Record<string, string> | null = null) {
    const klass = this.constructor as typeof HTTPRequest;
    this.method = klass.METHOD;
    this._responseHasBody = klass.RESPONSE_HAS_BODY;
    if (typeof path !== "string") {
      const hostname = path.hostname;
      if (!(hostname != null && hostname.length > 0)) {
        throw new ArgumentError("no host component for URI");
      }
      this.uri = path;
      const requestUri = path.requestUri();
      if (requestUri == null) throw new ArgumentError("no HTTP request path given");
      this.path = requestUri;
    } else {
      if (path == null) throw new ArgumentError("no HTTP request path given");
      if (path.length === 0) throw new ArgumentError("HTTP request path is empty");
      this.path = path;
    }
    if (initheader != null) {
      for (const [key, value] of Object.entries(initheader)) this.set(key, value);
    }
    if (this.get("Accept") == null) this.set("Accept", "*/*");
    if (this.get("User-Agent") == null) this.set("User-Agent", "Ruby");
    if (this.uri != null && this.get("host") == null) {
      const host = this.uri.hostname!;
      this.set("host", this.uri.port === this.uri.defaultPort ? host : `${host}:${this.uri.port}`);
    }
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#[]` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:224-227`). */
  get(key: string): string | null {
    return this._header[key.toLowerCase()] ?? null;
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#[]=` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:240-246`). */
  set(key: string, val: string): void {
    this._header[key.toLowerCase()] = val;
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#to_hash` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:477-479`). */
  toHash(): Record<string, string> {
    return { ...this._header };
  }

  /** @noRailsEquivalent PERMANENT */
  isResponseBodyPermitted(): boolean {
    return this._responseHasBody;
  }

  /** @noRailsEquivalent PERMANENT */
  setBodyInternal(str: string | Uint8Array | null): void {
    if (str != null && this.body != null) {
      throw new ArgumentError("both of body argument and HTTPRequest#body set");
    }
    if (str != null) this.body = str;
    if (this.body == null && (this.constructor as typeof HTTPRequest).REQUEST_HAS_BODY) {
      this.body = "";
    }
  }
}
