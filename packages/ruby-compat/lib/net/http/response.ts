import type { HttpClientResponse } from "../../http-adapter.js";
import { ArgumentError } from "../../argument-error.js";
import { IOError } from "../../io-error.js";
import { rbObjDup } from "../../include.js";
import type { HTTP as URIHTTP } from "../../uri/http.js";
import { Zlib } from "../../zlib.js";
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
  /** @noRailsEquivalent PERMANENT */
  decodeContent = false;
  /** @noRailsEquivalent PERMANENT */
  bodyEncoding: string | false = false;
  /** @noRailsEquivalent PERMANENT */
  ignoreEof = true;
  private _uri: URIHTTP | null = null;
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

  /** @noRailsEquivalent PERMANENT */
  get uri(): URIHTTP | null {
    return this._uri;
  }

  /** @noRailsEquivalent PERMANENT */
  set uri(uri: URIHTTP | null) {
    if (uri != null) this._uri = rbObjDup(uri);
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#[]=` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:240-246`). */
  set(key: string, val: string): void {
    this._header[key.toLowerCase()] = [val];
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#delete` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:453-455`). */
  delete(key: string): string[] | null {
    const v = this._header[key.toLowerCase()] ?? null;
    delete this._header[key.toLowerCase()];
    return v;
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#connection_close?` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:966-971`). */
  isConnectionClose(): boolean {
    const token = /(?:^|,)\s*close\s*(?:$|,)/i;
    if (this._header["connection"]?.some((v) => token.test(v))) return true;
    if (this._header["proxy-connection"]?.some((v) => token.test(v))) return true;
    return false;
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#connection_keep_alive?` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:974-979`). */
  isConnectionKeepAlive(): boolean {
    const token = /(?:^|,)\s*keep-alive\s*(?:$|,)/i;
    if (this._header["connection"]?.some((v) => token.test(v))) return true;
    if (this._header["proxy-connection"]?.some((v) => token.test(v))) return true;
    return false;
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

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#to_hash` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:477-479`). */
  toHash(): Record<string, string[]> {
    return { ...this._header };
  }

  /**
   * `vendor/ruby/v3.3.11/lib/net/http/response.rb:355-383`. The adapter has read the whole body
   * before `read_body` runs, so a block is yielded it as one chunk and `@body` keeps the bytes
   * where Ruby keeps the `Net::ReadAdapter` `procdest` builds.
   *
   * @noRailsEquivalent PERMANENT
   */
  readBody(
    dest: unknown = null,
    block: ((chunk: Uint8Array) => unknown) | null = null,
  ): Uint8Array | null {
    if (this._read) {
      if (dest != null || block != null) {
        throw new IOError(`${this.constructor.name}#read_body called twice`);
      }
      return this._body;
    }
    this.procdest(dest, block);
    this.streamCheck();
    this._body = this._bodyExist ? this.readBody0() : null;
    if (this._body != null && block != null) block(this._body);
    this._read = true;
    return this._body;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/response.rb:557-590`. */
  inflater<T>(block: (io: Uint8Array) => T): T {
    if (!this.decodeContent) return block(this._socket!.body);
    if (this.get("content-range") != null) return block(this._socket!.body);

    const v = this.get("content-encoding");
    switch (v?.toLowerCase()) {
      case "deflate":
      case "gzip":
      case "x-gzip": {
        this.delete("content-encoding");

        const inflateBodyIo = new Inflater(this._socket!.body);

        let success = false;
        let ret!: T;
        let finishError: unknown = null;
        try {
          ret = block(inflateBodyIo.readAll());
          success = true;
        } finally {
          try {
            inflateBodyIo.finish();
            if (this.get("content-length") != null) {
              this.set("content-length", String(inflateBodyIo.bytesInflated()));
            }
          } catch (err) {
            if (success) finishError = err;
          }
        }
        if (finishError != null) throw finishError;
        return ret;
      }
      case "none":
      case "identity":
        this.delete("content-encoding");

        return block(this._socket!.body);
      default:
        return block(this._socket!.body);
    }
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/response.rb:642-644`. */
  streamCheck(): void {
    if (this._socket == null) throw new IOError("attempt to read body out of block");
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/response.rb:646-654`. */
  procdest(dest: unknown, block: unknown): void {
    if (dest != null && block != null) {
      throw new ArgumentError("both arg and block given for HTTP method");
    }
  }

  /** @noRailsEquivalent PERMANENT */
  readBody0(): Uint8Array {
    return this.inflater((inflateBodyIo) => inflateBodyIo);
  }

  /** @noRailsEquivalent PERMANENT */
  get body(): Uint8Array | null {
    return this.readBody();
  }
}

/**
 * `Net::HTTPResponse::Inflater` (`vendor/ruby/v3.3.11/lib/net/http/response.rb:660-758`),
 * over the body bytes the adapter has already read.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class Inflater {
  private readonly _socket: Uint8Array;
  private readonly _inflate: InstanceType<typeof Zlib.Inflate>;

  /** @noRailsEquivalent PERMANENT */
  constructor(socket: Uint8Array) {
    this._socket = socket;
    this._inflate = new Zlib.Inflate(32 + Zlib.MAX_WBITS);
  }

  /** @noRailsEquivalent PERMANENT */
  finish(): void {
    if (this._inflate.totalIn() === 0) return;
    this._inflate.finish();
  }

  /** @noRailsEquivalent PERMANENT */
  bytesInflated(): number {
    return this._inflate.totalOut();
  }

  /** @noRailsEquivalent PERMANENT */
  readAll(): Uint8Array {
    return this._inflate.inflate(this._socket);
  }
}
