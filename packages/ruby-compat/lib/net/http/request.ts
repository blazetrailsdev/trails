import { strip } from "../../string/method-table.js";
import { rbStrToI } from "../../string/convert.js";
import { ArgumentError } from "../../argument-error.js";
import { Generic } from "../../uri/generic.js";
import { HTTPS as URIHTTPS } from "../../uri/https.js";
import { HTTP as URIHTTP } from "../../uri/http.js";
import { rbObjDup } from "../../include.js";
import { Base64 } from "../../base64.js";
import { warn } from "../../kernel-warn.js";
import { verbose } from "../../verbose.js";
import { IO } from "../../io.js";
import { kernelThrow } from "../../kernel-catch.js";
import { Net, type BufferedIO } from "../protocol.js";
import { URI } from "../../uri/common.js";
import { SecureRandom } from "../../secure-random.js";
import { Tempfile } from "../../tempfile.js";
import { File } from "../../file.js";
import { encode } from "../../string/encode.js";
import { rbObjRespondTo } from "../../object.js";

/** @internal @noRailsEquivalent PERMANENT — `HTTPGenericRequest::Chunker` (`vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:242-257`). */
class Chunker {
  private _sock: BufferedIO;
  private _prev: unknown;

  constructor(sock: BufferedIO) {
    this._sock = sock;
    this._prev = null;
  }

  async write(buf: Uint8Array): Promise<number> {
    const rv = buf.length;
    await this._sock.write(`${rv.toString(16)}\r\n`, buf, "\r\n");
    return rv;
  }

  async finish(): Promise<void> {
    await this._sock.write("0\r\n\r\n");
  }
}

/**
 * `Net::HTTPRequest` (`vendor/ruby/v3.3.11/lib/net/http/request.rb:40`), with the
 * part of `Net::HTTPGenericRequest#initialize`
 * (`vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:15-55`) and `HTTPHeader`
 * that `Net::HTTP#post` reaches.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class HTTPRequest {
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/header.rb:182`. */
  static readonly MAX_KEY_LENGTH = 1024;
  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/header.rb:183`. */
  static readonly MAX_FIELD_LENGTH = 65536;
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
  private _body: string | Uint8Array | null = null;
  /** @noRailsEquivalent PERMANENT */
  bodyStream:
    | { read(length?: number): string | Uint8Array | null | Promise<string | Uint8Array | null> }
    | IO
    | null = null;
  private _bodyData: FormParams | null = null;
  private _formOption: { boundary?: string; charset?: string } = {};
  private _header: Record<string, string> = {};
  private readonly _requestHasBody: boolean;
  private readonly _responseHasBody: boolean;

  /** @noRailsEquivalent PERMANENT */
  constructor(path: string | Generic, initheader: Record<string, string | null> | null = null) {
    const klass = this.constructor as typeof HTTPRequest;
    this.method = klass.METHOD;
    this._requestHasBody = klass.REQUEST_HAS_BODY;
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

    this.initializeHttpHeader(initheader);
    if (this.get("Accept") == null) this.set("Accept", "*/*");
    if (this.get("User-Agent") == null) this.set("User-Agent", "Ruby");
    if (host != null && this.get("Host") == null) this.set("Host", host);
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#initialize_http_header` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:185-205`). */
  initializeHttpHeader(initheader: Record<string, string | null> | null): void {
    this._header = {};
    if (initheader == null) return;
    const bytesize = (s: string) => new TextEncoder().encode(s).length;
    for (const [key, field] of Object.entries(initheader)) {
      if (this.isKey(key) && verbose() != null && verbose() !== false) {
        warn(`net/http: duplicated HTTP header: ${key}`, { uplevel: 3 });
      }
      if (field == null) {
        if (verbose() != null && verbose() !== false)
          warn(`net/http: nil HTTP header: ${key}`, { uplevel: 3 });
        continue;
      }
      const value = strip(field);
      if (bytesize(key) > HTTPRequest.MAX_KEY_LENGTH) {
        throw new ArgumentError(
          `too long (${bytesize(key)} bytes) header: ${JSON.stringify(key.slice(0, 30))}...`,
        );
      }
      if (bytesize(value) > HTTPRequest.MAX_FIELD_LENGTH) {
        throw new ArgumentError(`header ${key} has too long field value: ${bytesize(value)}`);
      }
      if (/[\r\n]/.test(value)) {
        throw new ArgumentError(
          `header ${key} has field value ${JSON.stringify(value)}, this cannot include CR/LF`,
        );
      }
      this._header[key.toLowerCase()] = value;
    }
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#key?` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:463-465`). */
  isKey(key: string): boolean {
    return Object.hasOwn(this._header, key.toLowerCase());
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#content_length` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:616-621`). */
  get contentLength(): number | null {
    if (!this.isKey("Content-Length")) return null;
    const len = /\d+/.exec(this.get("Content-Length")!)?.[0];
    if (len == null) throw new Net.HTTPHeaderSyntaxError("wrong Content-Length format");
    return Number.parseInt(len, 10);
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#content_length=` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:637-643`). */
  set contentLength(len: number | string | null) {
    if (len == null) {
      delete this._header["content-length"];
      return;
    }
    this._header["content-length"] = (
      typeof len === "number" ? BigInt(Math.trunc(len)) : BigInt(rbStrToI(len))
    ).toString();
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#content_type` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:701-711`). */
  get contentType(): string | null {
    const main = this.mainType();
    if (main == null) return null;

    const sub = this.subType();
    if (sub != null) {
      return `${main}/${sub}`;
    } else {
      return main;
    }
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#main_type` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:723-726`). */
  mainType(): string | null {
    if (this._header["content-type"] == null) return null;
    return (this.get("Content-Type")!.split(";")[0] ?? "").split("/")[0].trim();
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#sub_type` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:738-743`). */
  subType(): string | null {
    if (this._header["content-type"] == null) return null;
    const [, sub] = (this.get("Content-Type")!.split(";")[0] ?? "").split("/");
    if (sub == null) return null;
    return sub.trim();
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#set_content_type` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:772-774`). */
  setContentType(type: string, params: Record<string, string> = {}): void {
    this._header["content-type"] =
      type +
      Object.entries(params)
        .map(([k, v]) => `; ${k}=${v}`)
        .join("");
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#content_type=` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:776`). */
  set contentType(type: string) {
    this.setContentType(type);
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#set_form_data` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:812-817`). */
  setFormData(params: Record<string, unknown> | [string, unknown][], sep = "&"): void {
    let query = URI.encodeWwwForm(params);
    if (sep !== "&") query = query.replace(/&/g, sep);
    this.body = query;
    this.contentType = "application/x-www-form-urlencoded";
  }

  /** @noRailsEquivalent PERMANENT — `alias form_data= set_form_data` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:819`). */
  set formData(params: Record<string, unknown> | [string, unknown][]) {
    this.setFormData(params);
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#set_form` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:928-940`). */
  setForm(
    params: FormParams,
    enctype = "application/x-www-form-urlencoded",
    formopt: { boundary?: string; charset?: string } = {},
  ): void {
    this._bodyData = params;
    this._body = null;
    this.bodyStream = null;
    this._formOption = formopt;
    if (
      /^application\/x-www-form-urlencoded$/i.test(enctype) ||
      /^multipart\/form-data$/i.test(enctype)
    ) {
      this.contentType = enctype;
    } else {
      throw new ArgumentError(`invalid enctype: ${enctype}`);
    }
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#basic_auth` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:945-947`). */
  basicAuth(account: string, password: string): void {
    this._header["authorization"] = this.basicEncode(account, password);
  }

  /** @internal @noRailsEquivalent PERMANENT — `HTTPHeader#basic_encode` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:960-962`). */
  private basicEncode(account: string, password: string): string {
    return "Basic " + Base64.strictEncode64(`${account}:${password}`);
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

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:120-122`. */
  isRequestBodyPermitted(): boolean {
    return this._requestHasBody;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:129-131`. */
  isResponseBodyPermitted(): boolean {
    return this._responseHasBody;
  }

  /** @noRailsEquivalent PERMANENT — `HTTPGenericRequest#body_stream=` (`vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:179-184`). */
  setBodyStream(
    input:
      | { read(length?: number): string | Uint8Array | null | Promise<string | Uint8Array | null> }
      | IO
      | null,
  ): typeof input {
    this._body = null;
    this.bodyStream = input;
    this._bodyData = null;
    return input;
  }

  /** @noRailsEquivalent PERMANENT — `HTTPGenericRequest#body` (`vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:145`). */
  get body(): string | Uint8Array | null {
    return this._body;
  }

  /** @noRailsEquivalent PERMANENT — `HTTPGenericRequest#body=` (`vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:154-159`). */
  set body(str: string | Uint8Array | null) {
    this._body = str;
    this.bodyStream = null;
    this._bodyData = null;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:186-192`. */
  setBodyInternal(str: string | Uint8Array | null): void {
    if (str != null && (this._body != null || this.bodyStream != null)) {
      throw new ArgumentError("both of body argument and HTTPRequest#body set");
    }
    if (str != null) this.body = str;
    if (
      this._body == null &&
      this.bodyStream == null &&
      this._bodyData == null &&
      this.isRequestBodyPermitted()
    ) {
      this.body = "";
    }
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#chunked?` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:654-658`). */
  isChunked(): boolean {
    if (this._header["transfer-encoding"] == null) return false;
    const field = this.get("Transfer-Encoding")!;
    return /(?:^|[^-\w])chunked(?![-\w])/i.test(field) ? true : false;
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

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#delete` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:453-455`). */
  delete(key: string): string[] | null {
    const v = this._header[key.toLowerCase()];
    delete this._header[key.toLowerCase()];
    return v != null ? [v] : null;
  }

  /** @noRailsEquivalent PERMANENT — `HTTPHeader#each_capitalized` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:484-489`). */
  eachCapitalized(block: (key: string, value: string) => void): void {
    for (const [k, v] of Object.entries(this._header)) block(this.capitalize(k), v);
  }

  /** @internal @noRailsEquivalent PERMANENT — `HTTPHeader#capitalize` (`vendor/ruby/v3.3.11/lib/net/http/header.rb:493-495`). */
  private capitalize(name: string): string {
    return name
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
      .join("-");
  }

  /**
   * @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:198-208`.
   */
  async exec(sock: BufferedIO, ver: string, path: string): Promise<void> {
    if (this.body != null) {
      await this.sendRequestWithBody(sock, ver, path, this.body);
    } else if (this.bodyStream != null) {
      await this.sendRequestWithBodyStream(sock, ver, path, this.bodyStream);
    } else if (this._bodyData != null) {
      await this.sendRequestWithBodyData(sock, ver, path, this._bodyData);
    } else {
      await this.writeHeader(sock, ver, path);
    }
  }

  /**
   * @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:259-266`.
   */
  private async sendRequestWithBody(
    sock: BufferedIO,
    ver: string,
    path: string,
    body: string | Uint8Array,
  ): Promise<void> {
    this.contentLength =
      typeof body === "string" ? new TextEncoder().encode(body).length : body.length;
    this.delete("Transfer-Encoding");
    this.supplyDefaultContentType();
    await this.writeHeader(sock, ver, path);
    if (sock.continueTimeout != null) await this.waitForContinue(sock, ver);
    await sock.write(body);
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:268-283`. */
  private async sendRequestWithBodyStream(
    sock: BufferedIO,
    ver: string,
    path: string,
    f:
      | { read(length?: number): string | Uint8Array | null | Promise<string | Uint8Array | null> }
      | IO,
  ): Promise<void> {
    if (!(this.contentLength != null || this.isChunked())) {
      throw new ArgumentError("Content-Length not given and Transfer-Encoding is not `chunked'");
    }
    this.supplyDefaultContentType();
    await this.writeHeader(sock, ver, path);
    if (sock.continueTimeout != null) await this.waitForContinue(sock, ver);
    if (this.isChunked()) {
      const chunker = new Chunker(sock);
      await IO.copyStreamAsync(f, chunker);
      await chunker.finish();
    } else {
      await IO.copyStreamAsync(f, sock);
    }
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:285-311`. */
  private async sendRequestWithBodyData(
    sock: BufferedIO,
    ver: string,
    path: string,
    params: FormParams,
  ): Promise<void> {
    if (!/^multipart\/form-data$/i.test(this.contentType ?? "")) {
      this.contentType = "application/x-www-form-urlencoded";
      return this.sendRequestWithBody(sock, ver, path, URI.encodeWwwForm(params));
    }

    const opt = { ...this._formOption };
    opt.boundary ||= SecureRandom.urlsafeBase64(40);
    this.setContentType(this.contentType!, { boundary: opt.boundary });
    if (this.isChunked()) {
      await this.writeHeader(sock, ver, path);
      await this.encodeMultipartFormData(sock, params, opt);
    } else {
      const file = Tempfile.new("multipart");
      file.binmode();
      await this.encodeMultipartFormData(file, params, opt);
      file.rewind();
      this.contentLength = file.size();
      await this.writeHeader(sock, ver, path);
      await IO.copyStreamAsync(file, sock);
      file.close(true);
    }
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:313-363`. */
  private async encodeMultipartFormData(
    out: FormOut,
    params: FormParams,
    opt: { boundary?: string; charset?: string },
  ): Promise<void> {
    const charset = opt.charset;
    let boundary = opt.boundary;
    boundary ||= SecureRandom.urlsafeBase64(40);
    const chunkedP = this.isChunked();

    const buf: (string | Uint8Array)[] = [];
    for (const [rawKey, rawValue, h = {}] of Array.isArray(params)
      ? params
      : Object.entries(params)) {
      const key = this.quoteString(rawKey, charset);
      const value = rawValue as FormIO;
      let filename = Object.hasOwn(h, "filename")
        ? h.filename
        : rbObjRespondTo(value, "toPath")
          ? File.basename(value.toPath())
          : null;

      buf.push(`--${boundary}\r\n`);
      if (filename != null) {
        filename = this.quoteString(filename, charset);
        const type = h.contentType ?? "application/octet-stream";
        buf.push(
          `Content-Disposition: form-data; name="${key}"; filename="${filename}"\r\n` +
            `Content-Type: ${type}\r\n\r\n`,
        );
        if (!rbObjRespondTo(out, "write") || !rbObjRespondTo(value, "read")) {
          buf.push(_formValue(rbObjRespondTo(value, "read") ? await value.read() : value));
        } else if (rbObjRespondTo(value, "size") && chunkedP) {
          await this.flushBuffer(out, buf, chunkedP);
          if (chunkedP) await out.write(`${value.size().toString(16)}\r\n`);
          await IO.copyStreamAsync(value, out as { write(data: Uint8Array): unknown });
          if (chunkedP) await out.write("\r\n");
        } else {
          await this.flushBuffer(out, buf, chunkedP);
          while (await this.flushBuffer(out, await value.read(4096), chunkedP));
        }
      } else {
        buf.push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`);
        buf.push(_formValue(rbObjRespondTo(value, "read") ? await value.read() : value));
      }
      buf.push("\r\n");
    }
    buf.push(`--${boundary}--\r\n`);
    await this.flushBuffer(out, buf, chunkedP);
    if (chunkedP) await out.write("0\r\n\r\n");
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:365-368`. */
  private quoteString(str: string, charset: string | undefined): string {
    if (charset != null) {
      str = encode(str, charset, { fallback: (c) => `&#${c.codePointAt(0)};` }) as string;
    }
    return str.replace(/[\\"]/g, "\\$&");
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:370-377`. */
  private async flushBuffer(
    out: FormOut,
    buf: (string | Uint8Array)[] | string | Uint8Array | null,
    chunkedP: boolean,
  ): Promise<boolean | void> {
    if (buf == null) return;
    const bytes = _concatBytes(Array.isArray(buf) ? buf : [buf]);
    if (chunkedP) await out.write(`${bytes.length.toString(16)}\r\n`);
    await out.write(bytes);
    if (chunkedP) await out.write("\r\n");
    if (Array.isArray(buf)) buf.length = 0;
    return true;
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:385-390`. */
  private supplyDefaultContentType(): void {
    if (this.contentType != null) return;
    if (verbose() === true) {
      warn("net/http: Content-Type did not set; using application/x-www-form-urlencoded", {
        uplevel: 1,
      });
    }
    this.setContentType("application/x-www-form-urlencoded");
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:371-383`. */
  private async waitForContinue(sock: BufferedIO, ver: string): Promise<void> {
    if (
      ver >= "1.1" &&
      this._header["expect"] != null &&
      [this._header["expect"]].includes("100-continue")
    ) {
      if (await sock.io.waitReadable(sock.continueTimeout)) {
        const res = await Net.HTTPResponse.readNew(sock);
        if (!(res instanceof Net.HTTPContinue)) {
          res.decodeContent = this.decodeContent;
          kernelThrow("response", res);
        }
      }
    }
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/http/generic_request.rb:399-411`. */
  private async writeHeader(sock: BufferedIO, ver: string, path: string): Promise<void> {
    const reqline = `${this.method} ${path} HTTP/${ver}`;
    if (/[\r\n]/.test(reqline)) {
      throw new ArgumentError("A Request-Line must not contain CR or LF");
    }
    let buf = "";
    buf += reqline + "\r\n";
    this.eachCapitalized((k, v) => (buf += `${k}: ${v}\r\n`));
    buf += "\r\n";
    await sock.write(buf);
  }
}

/** @noRailsEquivalent PERMANENT — the `params` `set_form` takes (`vendor/ruby/v3.3.11/lib/net/http/header.rb:928`). */
export type FormParams =
  | Record<string, unknown>
  | [string, unknown, { filename?: string; contentType?: string }?][];

type FormOut = { write(str: string | Uint8Array): unknown };

type FormIO = {
  read(length?: number): string | Uint8Array | null;
  toPath(): string;
  size(): number;
  write(str: string | Uint8Array): unknown;
};

function _formValue(value: unknown): string | Uint8Array {
  return value instanceof Uint8Array ? value : String(value);
}

function _concatBytes(buf: (string | Uint8Array)[]): Uint8Array {
  const parts = buf.map((x) => (typeof x === "string" ? new TextEncoder().encode(x) : x));
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  return bytes;
}
