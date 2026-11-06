import type { HttpClientResponse } from "../../http-adapter.js";
import { IOError } from "../../io-error.js";
import { Net } from "../protocol.js";

/**
 * `Net::HTTPResponse` (`vendor/ruby/v3.3.11/lib/net/http/response.rb:136`), with
 * the part of `HTTPHeader` its reader reaches. The adapter has already read the
 * status line, headers and body off the socket, so `read_new` reads them off
 * the adapter's response.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class HTTPResponse {
  /** @noRailsEquivalent PERMANENT */
  static readonly HAS_BODY: boolean;
  /** @noRailsEquivalent PERMANENT */
  static CODE_CLASS_TO_OBJ: Record<string, typeof HTTPResponse>;
  /** @noRailsEquivalent PERMANENT */
  static CODE_TO_OBJ: Record<string, typeof HTTPResponse>;

  /** @noRailsEquivalent PERMANENT */
  static isBodyPermitted(): boolean {
    return this.HAS_BODY;
  }

  /** @noRailsEquivalent PERMANENT */
  static readNew(sock: HttpClientResponse): HTTPResponse {
    const [httpv, code, msg] = [sock.httpVersion, String(sock.statusCode), sock.statusMessage];
    const res = new (this.responseClass(code))(httpv, code, msg);
    for (const [k, v] of Object.entries(sock.headers)) {
      if (v == null) continue;
      for (const value of Array.isArray(v) ? v : [v]) res.addField(k, value);
    }
    return res;
  }

  /** @noRailsEquivalent PERMANENT */
  static responseClass(code: string): typeof HTTPResponse {
    return (
      this.CODE_TO_OBJ[code] ?? this.CODE_CLASS_TO_OBJ[code.slice(0, 1)] ?? Net.HTTPUnknownResponse
    );
  }

  /** @noRailsEquivalent PERMANENT */
  readonly httpVersion: string;
  /** @noRailsEquivalent PERMANENT */
  readonly code: string;
  /** @noRailsEquivalent PERMANENT */
  readonly message: string;
  private readonly _header: Record<string, string[]> = {};
  private _body: Uint8Array | null = null;
  private _read = false;
  private _socket: HttpClientResponse | null = null;
  private _bodyExist = false;

  /** @noRailsEquivalent PERMANENT */
  constructor(httpv: string, code: string, msg: string) {
    this.httpVersion = httpv;
    this.code = code;
    this.message = msg;
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#[]` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:224-227`). */
  get(key: string): string | null {
    const a = this._header[key.toLowerCase()];
    return a ? a.join(", ") : null;
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#add_field` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:261-268`). */
  addField(key: string, val: string): void {
    const stringifiedDowncasedKey = key.toLowerCase();
    (this._header[stringifiedDowncasedKey] ??= []).push(val);
  }

  /** @noRailsEquivalent PERMANENT */
  async readingBody(
    sock: HttpClientResponse,
    reqmethodallowbody: boolean,
    block: () => unknown,
  ): Promise<Uint8Array | null> {
    this._socket = sock;
    this._bodyExist =
      reqmethodallowbody && (this.constructor as typeof HTTPResponse).isBodyPermitted();
    try {
      await block();
      return this.body;
    } finally {
      this._socket = null;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  readBody(dest: unknown = null): Uint8Array | null {
    if (this._read) {
      if (dest != null) throw new IOError(`${this.constructor.name}#read_body called twice`);
      return this._body;
    }
    this._body = this._bodyExist ? this._socket!.body : null;
    this._read = true;
    return this._body;
  }

  /** @noRailsEquivalent PERMANENT */
  get body(): Uint8Array | null {
    return this.readBody();
  }
}
