import { ArgumentError } from "../../argument-error.js";
import { Generic } from "../../uri/generic.js";
import { HTTPS as URIHTTPS } from "../../uri/https.js";
import { HTTP as URIHTTP } from "../../uri/http.js";
import { rbObjDup } from "../../include.js";

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
  uri: URIHTTP | null;
  /** @noRailsEquivalent PERMANENT */
  readonly decodeContent: boolean;
  /** @noRailsEquivalent PERMANENT */
  body: string | Uint8Array | null = null;
  private readonly _header: Record<string, string> = {};
  private readonly _responseHasBody: boolean;

  /** @noRailsEquivalent PERMANENT */
  constructor(path: string | Generic, initheader: Record<string, string> | null = null) {
    const klass = this.constructor as typeof HTTPRequest;
    this.method = klass.METHOD;
    this._responseHasBody = klass.RESPONSE_HAS_BODY;

    let host: string | null;
    if (path instanceof Generic) {
      if (!(path instanceof URIHTTP)) throw new ArgumentError("not an HTTP URI");
      const hostname = path.hostname;
      if (!(hostname != null && hostname.length > 0)) {
        throw new ArgumentError("no host component for URI");
      }
      const uri = rbObjDup(path);
      this.uri = uri;
      host = uri.hostname!;
      if (uri.port !== uri.defaultPort) host += `:${uri.port}`;
      const requestUri = path.requestUri();
      if (requestUri == null) throw new ArgumentError("no HTTP request path given");
      this.path = requestUri;
    } else {
      this.uri = null;
      host = null;
      if (path == null) throw new ArgumentError("no HTTP request path given");
      if (path.length === 0) throw new ArgumentError("HTTP request path is empty");
      this.path = path;
    }

    let decodeContent = false;

    if (
      initheader == null ||
      !Object.keys(initheader).some((k) => ["accept-encoding", "range"].includes(k.toLowerCase()))
    ) {
      if (this._responseHasBody) decodeContent = true;
      initheader = initheader != null ? { ...initheader } : {};
      initheader["accept-encoding"] = "gzip;q=1.0,deflate;q=0.6,identity;q=0.3";
    }
    this.decodeContent = decodeContent;

    for (const [key, value] of Object.entries(initheader)) this.set(key, value);
    if (this.get("Accept") == null) this.set("Accept", "*/*");
    if (this.get("User-Agent") == null) this.set("User-Agent", "Ruby");
    if (host != null && this.get("Host") == null) this.set("Host", host);
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
  toHash(): Record<string, string[]> {
    return Object.fromEntries(Object.entries(this._header).map(([k, v]) => [k, [v]]));
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

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#connection_close?` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:966-971`). */
  isConnectionClose(): boolean {
    const token = /(?:^|,)\s*close\s*(?:$|,)/i;
    if (this._header["connection"] != null && token.test(this._header["connection"])) return true;
    if (this._header["proxy-connection"] != null && token.test(this._header["proxy-connection"])) {
      return true;
    }
    return false;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:210-237`. */
  updateUri(addr: string, port: number, ssl: boolean): void {
    if (this.uri == null) return;

    let scheme: string;
    let klass: typeof URIHTTP;
    if (ssl) {
      scheme = "https";
      klass = URIHTTPS;
    } else {
      scheme = "http";
      klass = URIHTTP;
    }

    let host = this.get("host");
    if (host != null) {
      host = host.replace(/:[\s\S]*/, "");
    } else if (this.uri.host != null) {
      host = this.uri.host;
    } else {
      host = addr;
    }
    const uri: Generic = this.uri;
    if (uri instanceof klass) {
      uri.host = host;
      uri.port = port;
    } else {
      this.uri = new klass(scheme, uri.userinfo, host, port, null, uri.path, null, uri.query, null);
    }
  }
}
