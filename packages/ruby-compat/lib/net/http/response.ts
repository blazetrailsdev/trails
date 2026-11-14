import type { HttpClientResponse } from "../../http-adapter.js";
import { ArgumentError } from "../../argument-error.js";
import { EOFError } from "../../eof-error.js";
import { IOError } from "../../io-error.js";
import { rbObjDup } from "../../include.js";
import type { HTTP as URIHTTP } from "../../uri/http.js";
import { Zlib } from "../../zlib.js";
import { Net, ReadAdapter } from "../protocol.js";

/**
 * `Net::HTTPResponse` (`vendor/ruby/v3.3.11/lib/net/http/response.rb:136`), with
 * the part of `HTTPHeader` its reader reaches. The adapter has already read the
 * status line and headers off the socket, so `read_new` reads them off the
 * adapter's response, whose body streams as the socket delivers it.
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
  private _body: Uint8Array | ReadAdapter | { append(str: Uint8Array): unknown } | null = null;
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
  ): Promise<HTTPResponse["body"]> {
    this._socket = sock;
    this._bodyExist =
      reqmethodallowbody && (this.constructor as typeof HTTPResponse).isBodyPermitted();
    try {
      await block();
      return await this.readBody();
    } finally {
      this._socket = null;
    }
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#to_hash` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:477-479`). */
  toHash(): Record<string, string[]> {
    return { ...this._header };
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#chunked?` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:654-658`). */
  isChunked(): boolean {
    const field = this.get("transfer-encoding");
    return field != null && /(?:^|[^-\w])chunked(?![-\w])/i.test(field);
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#content_length` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:616-621`). */
  get contentLength(): number | null {
    const len = this.get("content-length");
    if (len == null) return null;
    const m = /\d+/.exec(len);
    if (m == null) throw new Net.HTTPHeaderSyntaxError("wrong Content-Length format");
    return Number(m[0]);
  }

  /**
   * `vendor/ruby/v3.3.11/lib/net/http/response.rb:355-383`. The `@body_encoding`
   * arm is not ported: a JS string carries no encoding tag (CLAUDE.md, "A String
   * has no encoding tag either"), and the body is bytes.
   *
   * @noRailsEquivalent PERMANENT
   */
  async readBody(
    dest: { append(str: Uint8Array): unknown } | null = null,
    block: ((chunk: Uint8Array) => unknown) | null = null,
  ): Promise<HTTPResponse["body"]> {
    if (this._read) {
      if (dest != null || block != null) {
        throw new IOError(`${this.constructor.name}#read_body called twice`);
      }
      return this._body;
    }
    const to = this.procdest(dest, block);
    this.streamCheck();
    if (this._bodyExist) {
      await this.readBody0(to);
      this._body = Array.isArray(to) ? _concat(to) : to;
    } else {
      this._body = null;
    }
    this._read = true;
    return this._body;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/response.rb:557-590`. */
  async inflater(block: (io: AsyncIterable<Uint8Array>) => Promise<void>): Promise<void> {
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
        let finishError: unknown = null;
        try {
          await block(inflateBodyIo);
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
        return;
      }
      case "none":
      case "identity":
        this.delete("content-encoding");

        return block(this._socket!.body);
      default:
        return block(this._socket!.body);
    }
  }

  /**
   * `vendor/ruby/v3.3.11/lib/net/http/response.rb:592-613`. The adapter has
   * already de-chunked and length-delimited the body, so each arm reads it to
   * the end and differs only in whether an early EOF raises.
   *
   * @noRailsEquivalent PERMANENT
   */
  async readBody0(
    dest: ReadAdapter | { append(str: Uint8Array): unknown } | Uint8Array[],
  ): Promise<void> {
    await this.inflater(async (inflateBodyIo) => {
      if (this.isChunked()) {
        await _read(inflateBodyIo, dest, false);
        return;
      }

      let clen = this.contentLength;
      if (clen != null) {
        await _read(inflateBodyIo, dest, this.ignoreEof);
        return;
      }
      clen = this.rangeLength();
      if (clen != null) {
        await _read(inflateBodyIo, dest, false);
        return;
      }
      await _read(inflateBodyIo, dest, true);
    });
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#content_range` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:670-676`). */
  contentRange(): [number, number] | null {
    const field = this.get("content-range");
    if (field == null) return null;
    const m = /^\s*(\w+)\s+(\d+)-(\d+)\/(\d+|\*)/.exec(field);
    if (m == null) throw new Net.HTTPHeaderSyntaxError("wrong Content-Range format");
    if (m[1] !== "bytes") return null;
    return [Number(m[2]), Number(m[3])];
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#range_length` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:687-690`). */
  rangeLength(): number | null {
    const r = this.contentRange();
    if (r == null) return null;
    return r[1] - r[0] + 1;
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/response.rb:642-644`. */
  private streamCheck(): void {
    if (this._socket == null) throw new IOError("attempt to read body out of block");
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/response.rb:646-654`. */
  private procdest(
    dest: { append(str: Uint8Array): unknown } | null,
    block: ((chunk: Uint8Array) => unknown) | null,
  ): ReadAdapter | { append(str: Uint8Array): unknown } | Uint8Array[] {
    if (dest != null && block != null) {
      throw new ArgumentError("both arg and block given for HTTP method");
    }
    if (block != null) {
      return new ReadAdapter(block);
    } else {
      return dest ?? [];
    }
  }

  /**
   * `HTTPResponse#body` (`vendor/ruby/v3.3.11/lib/net/http/response.rb:400-402`),
   * read once `reading_body` has awaited `read_body`.
   *
   * @noRailsEquivalent PERMANENT
   */
  get body(): Uint8Array | ReadAdapter | { append(str: Uint8Array): unknown } | null {
    return this._body;
  }
}

/**
 * `BufferedIO#read` / `#read_all` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:155-192`)
 * over the adapter's body stream.
 *
 * @noRailsEquivalent PERMANENT
 */
async function _read(
  io: AsyncIterable<Uint8Array>,
  dest: ReadAdapter | { append(str: Uint8Array): unknown } | Uint8Array[],
  ignoreEof: boolean,
): Promise<void> {
  try {
    for await (const chunk of io) {
      if (Array.isArray(dest)) dest.push(chunk);
      else await dest.append(chunk);
    }
  } catch (e) {
    if (!(e instanceof EOFError) || !ignoreEof) throw e;
  }
}

/** @noRailsEquivalent PERMANENT */
function _concat(chunks: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}

/**
 * `Net::HTTPResponse::Inflater` (`vendor/ruby/v3.3.11/lib/net/http/response.rb:660-758`),
 * over the body bytes the adapter has already read.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class Inflater {
  private readonly _socket: AsyncIterable<Uint8Array>;
  private readonly _inflate: InstanceType<typeof Zlib.Inflate>;

  /** @noRailsEquivalent PERMANENT */
  constructor(socket: AsyncIterable<Uint8Array>) {
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

  /** @noRailsEquivalent PERMANENT — `Inflater#read_all` (`vendor/ruby/v3.3.11/lib/net/http/response.rb:729-735`). */
  async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
    for await (const chunk of this._socket) yield this._inflate.inflate(chunk);
  }
}
