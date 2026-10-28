import { StandardError } from "./standard-error.js";
import { ArgumentError } from "./argument-error.js";
import { RuntimeError } from "./runtime-error.js";
import { StringIO } from "./string-io.js";
import { Tempfile } from "./tempfile.js";
import { extend, include } from "./include.js";
import { block, rbBlockGivenP } from "./hash.js";
import { URI, InvalidURIError } from "./uri/common.js";
import { Generic } from "./uri/generic.js";
import { HTTP } from "./uri/http.js";

type OpenUriIO = (StringIO | Tempfile) & Meta;
type OpenUriOptions = Record<string, unknown>;

/**
 * `OpenURI::Meta` (`vendor/ruby/v3.3.11/lib/open-uri.rb:436`): the status,
 * base URI and header fields an opened IO carries. `meta_setup_encoding`
 * (`open-uri.rb:472`) is not ported, since a String has no encoding tag here.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface Meta {
  status: [string, string];
  baseUri: Generic | null;
  meta: Record<string, string>;
  metas: Record<string, string[]>;
  metaAddField2(name: string, values: string[]): void;
}

const Meta = {
  /**
   * `Meta.init` (`vendor/ruby/v3.3.11/lib/open-uri.rb:437-451`).
   *
   * @noRailsEquivalent PERMANENT
   */
  init(obj: object, src: Meta | null = null): void {
    extend(obj, Meta);
    Object.assign(obj, { baseUri: null, meta: {}, metas: {} });
    if (src != null) {
      const meta = obj as Meta;
      meta.status = src.status;
      meta.baseUri = src.baseUri;
      for (const [name, values] of Object.entries(src.metas)) meta.metaAddField2(name, values);
    }
  },
  /**
   * `Meta#meta_add_field2` (`vendor/ruby/v3.3.11/lib/open-uri.rb:491-496`).
   *
   * @noRailsEquivalent PERMANENT
   */
  metaAddField2(this: Meta, name: string, values: string[]): void {
    name = name.toLowerCase();
    this.metas[name] = values;
    this.meta[name] = values.join(", ");
  },
};

/**
 * `OpenURI::Buffer` (`vendor/ruby/v3.3.11/lib/open-uri.rb:401-426`).
 *
 * @noRailsEquivalent PERMANENT
 */
class Buffer {
  static StringMax = 10240;
  declare _io: StringIO | Tempfile;
  declare _size: number;

  constructor() {
    this._io = new StringIO();
    this._size = 0;
  }

  get size(): number {
    return this._size;
  }

  append(str: Uint8Array): void {
    this._io.write(str);
    this._size += str.length;
    if (this._io instanceof StringIO && Buffer.StringMax < this._size) {
      const io = Tempfile.new("open-uri");
      io.binmode();
      if (typeof (this._io as Partial<Meta>).metaAddField2 === "function")
        Meta.init(io, this._io as StringIO & Meta);
      io.write(this._io.string());
      this._io = io;
    }
  }

  get io(): OpenUriIO {
    if (typeof (this._io as Partial<Meta>).metaAddField2 !== "function") Meta.init(this._io);
    return this._io as OpenUriIO;
  }
}

/**
 * `OpenURI::HTTPError` (`vendor/ruby/v3.3.11/lib/open-uri.rb:380-386`).
 *
 * @noRailsEquivalent PERMANENT
 */
class HTTPError extends StandardError {
  readonly io: unknown;

  constructor(message: string, io: unknown) {
    super(message);
    this.io = io;
  }
}

/**
 * `OpenURI::HTTPRedirect` (`vendor/ruby/v3.3.11/lib/open-uri.rb:390-396`).
 *
 * @noRailsEquivalent PERMANENT
 */
class HTTPRedirect extends HTTPError {
  readonly uri: Generic;

  constructor(message: string, io: unknown, uri: Generic) {
    super(message, io);
    this.uri = uri;
  }
}

/**
 * `OpenURI::TooManyRedirects` (`vendor/ruby/v3.3.11/lib/open-uri.rb:398`).
 *
 * @noRailsEquivalent PERMANENT
 */
class TooManyRedirects extends HTTPError {}

/**
 * `catch(:open_uri_redirect)` / `throw` (`vendor/ruby/v3.3.11/lib/open-uri.rb:217,375`).
 *
 * @noRailsEquivalent PERMANENT
 */
class OpenUriRedirect {
  constructor(readonly uri: Generic) {}
}

/**
 * `OpenURI::OpenRead` (`vendor/ruby/v3.3.11/lib/open-uri.rb:577-764`), which
 * `URI::HTTP` includes (`open-uri.rb:767-774`).
 *
 * @noRailsEquivalent PERMANENT
 */
export interface OpenRead {
  open(...rest: unknown[]): Promise<unknown>;
  read(options?: OpenUriOptions): Promise<string | Uint8Array>;
}

const OpenRead = {
  /**
   * `OpenRead#open` (`vendor/ruby/v3.3.11/lib/open-uri.rb:749-751`).
   *
   * @noRailsEquivalent PERMANENT
   */
  open(this: Generic, ...rest: unknown[]): Promise<unknown> {
    return OpenURI.openUri(this, ...rest);
  },
  /**
   * `OpenRead#read` (`vendor/ruby/v3.3.11/lib/open-uri.rb:757-763`).
   *
   * @noRailsEquivalent PERMANENT
   */
  read(this: Generic & OpenRead, options: OpenUriOptions = {}): Promise<string | Uint8Array> {
    return this.open(
      options,
      block((f: OpenUriIO) => {
        const str = f.read();
        Meta.init(str as object, f);
        return str;
      }),
    ) as Promise<string | Uint8Array>;
  },
};

/**
 * Ruby's `OpenURI` (`vendor/ruby/v3.3.11/lib/open-uri.rb:92`). Its symbol
 * options keep the Symbol's leading colon (`":redirect"`), since
 * `open_http` tells them from string-keyed header fields by `String === k`
 * (`open-uri.rb:274`).
 *
 * `Net::HTTP` is not ported, so `open_http` sends the request with `fetch`,
 * and the proxy and TLS options it hands `Net::HTTP` have nothing to reach.
 *
 * @noRailsEquivalent PERMANENT
 */
export const OpenURI = {
  /**
   * `OpenURI::Options` (`vendor/ruby/v3.3.11/lib/open-uri.rb:96-112`).
   *
   * @noRailsEquivalent PERMANENT
   */
  Options: {
    ":proxy": true,
    ":proxy_http_basic_authentication": true,
    ":progress_proc": true,
    ":content_length_proc": true,
    ":http_basic_authentication": true,
    ":read_timeout": true,
    ":open_timeout": true,
    ":ssl_ca_cert": null,
    ":ssl_verify_mode": null,
    ":ssl_min_version": null,
    ":ssl_max_version": null,
    ":ftp_active_mode": false,
    ":redirect": true,
    ":encoding": null,
    ":max_redirects": 64,
  } as OpenUriOptions,

  /**
   * `OpenURI.check_options` (`vendor/ruby/v3.3.11/lib/open-uri.rb:114-121`).
   *
   * @noRailsEquivalent PERMANENT
   */
  checkOptions(options: OpenUriOptions): void {
    for (const k of Object.keys(options)) {
      if (!k.startsWith(":")) continue;
      if (!Object.hasOwn(OpenURI.Options, k)) {
        throw new ArgumentError(`unrecognized option: ${k.slice(1)}`);
      }
    }
  },

  /**
   * `OpenURI.scan_open_optional_arguments` (`vendor/ruby/v3.3.11/lib/open-uri.rb:123-131`).
   *
   * @noRailsEquivalent PERMANENT
   */
  scanOpenOptionalArguments(...rest: unknown[]): [unknown, unknown, unknown[]] {
    let mode: unknown, perm: unknown;
    if (rest.length !== 0 && (typeof rest[0] === "string" || Number.isInteger(rest[0]))) {
      mode = rest.shift();
      if (rest.length !== 0 && Number.isInteger(rest[0])) {
        perm = rest.shift();
      }
    }
    return [mode, perm, rest];
  },

  /**
   * `OpenURI.open_uri` (`vendor/ruby/v3.3.11/lib/open-uri.rb:133-173`). The
   * `rb`-mode encoding and the `:encoding` option are scanned and checked but
   * not applied, since a String carries no encoding tag here.
   *
   * @noRailsEquivalent PERMANENT
   */
  async openUri(name: Generic | string, ...rest: unknown[]): Promise<unknown> {
    const blk = rbBlockGivenP(rest.at(-1)) ? (rest.pop() as (io: OpenUriIO) => unknown) : undefined;
    const uri = name instanceof Generic ? name : URI.parse(name);
    let mode: unknown;
    [mode, , rest] = OpenURI.scanOpenOptionalArguments(...rest);
    let options: OpenUriOptions | undefined;
    if (rest.length !== 0 && typeof rest[0] === "object" && rest[0] !== null) {
      options = rest.shift() as OpenUriOptions;
    }
    if (rest.length !== 0) throw new ArgumentError("extra arguments");
    options ??= {};
    OpenURI.checkOptions(options);

    let encoding: unknown;
    const m = typeof mode === "string" ? /^rb?(?:$|:([^:]+))/.exec(mode) : null;
    if (m) {
      encoding = m[1];
      mode = null;
    }
    if (Object.hasOwn(options, ":encoding")) {
      if (encoding != null) throw new ArgumentError("encoding specified twice");
    }

    if (!(mode == null || mode === "r" || mode === "rb" || mode === 0)) {
      throw new ArgumentError(
        `invalid access mode ${String(mode)} (${uri.constructor.name} resource is read only.)`,
      );
    }

    const io = await OpenURI.openLoop(uri, options);
    if (blk) {
      try {
        return await blk(io);
      } finally {
        if (io instanceof Tempfile) io.closeBang();
        else if (!io.isClosed()) io.close();
      }
    } else {
      return io;
    }
  },

  /**
   * `OpenURI.open_loop` (`vendor/ruby/v3.3.11/lib/open-uri.rb:175-248`), from
   * its redirect loop (`open-uri.rb:213`); the proxy scan before it has no
   * `Net::HTTP` to configure.
   *
   * @noRailsEquivalent PERMANENT
   */
  async openLoop(uri: Generic, options: OpenUriOptions): Promise<OpenUriIO> {
    const uriSet: Record<string, boolean> = {};
    const maxRedirects = options[":max_redirects"] as number | undefined;
    let buf!: Buffer;
    for (;;) {
      let redirect: Generic | null = null;
      try {
        buf = new Buffer();
        await (uri as HTTP).bufferOpen(buf, null, options);
      } catch (error) {
        if (!(error instanceof OpenUriRedirect)) throw error;
        redirect = error.uri;
      }
      if (redirect != null) {
        if (redirect.isRelative()) {
          redirect = uri.merge(redirect);
        }
        if (!(Object.hasOwn(options, ":redirect") ? options[":redirect"] : true)) {
          throw new HTTPRedirect(buf.io.status.join(" "), buf.io, redirect);
        }
        if (!OpenURI.isRedirectable(uri, redirect)) {
          throw new RuntimeError(`redirection forbidden: ${uri} -> ${redirect}`);
        }
        if (Object.hasOwn(options, ":http_basic_authentication")) {
          options = { ...options };
          delete options[":http_basic_authentication"];
        }
        uri = redirect;
        if (Object.hasOwn(uriSet, uri.toString())) {
          throw new RuntimeError(`HTTP redirection loop: ${uri}`);
        }
        uriSet[uri.toString()] = true;
        if (maxRedirects != null && Object.keys(uriSet).length > maxRedirects) {
          throw new TooManyRedirects("Too many redirects", buf.io);
        }
      } else {
        break;
      }
    }
    const io = buf.io;
    io.baseUri = uri;
    return io;
  },

  /**
   * `OpenURI.redirectable?` (`vendor/ruby/v3.3.11/lib/open-uri.rb:250-259`).
   *
   * @noRailsEquivalent PERMANENT
   */
  isRedirectable(uri1: Generic, uri2: Generic): boolean {
    return (
      uri1.scheme!.toLowerCase() === uri2.scheme!.toLowerCase() ||
      (/^(?:http|ftp)$/i.test(uri1.scheme!) && /^(?:https?|ftp)$/i.test(uri2.scheme!))
    );
  },

  /**
   * `OpenURI.open_http` (`vendor/ruby/v3.3.11/lib/open-uri.rb:264-378`), with
   * `fetch` standing in for `Net::HTTP#request`; `redirect: "manual"` leaves
   * the redirect to `open_loop`, as `Net::HTTP` does.
   *
   * @noRailsEquivalent PERMANENT
   */
  async openHttp(
    buf: Buffer,
    target: Generic,
    _proxy: unknown,
    options: OpenUriOptions,
  ): Promise<void> {
    if (target.userinfo != null) {
      throw new ArgumentError("userinfo not supported.  [RFC3986]");
    }

    const header: Record<string, string> = {};
    for (const [k, v] of Object.entries(options)) if (!k.startsWith(":")) header[k] = String(v);

    if (Object.hasOwn(options, ":http_basic_authentication")) {
      const [user, pass] = options[":http_basic_authentication"] as [string, string];
      header["Authorization"] = `Basic ${btoa(`${user}:${pass}`)}`;
    }
    const resp = await fetch(target.toString(), { headers: header, redirect: "manual" });
    const contentLengthProc = options[":content_length_proc"] as
      | ((length: number | null) => unknown)
      | undefined;
    if (contentLengthProc != null && resp.ok) {
      const length = resp.headers.get("Content-Length");
      contentLengthProc(length != null ? parseInt(length, 10) || 0 : null);
    }
    const progressProc = options[":progress_proc"] as ((size: number) => unknown) | undefined;
    if (resp.body != null) {
      for await (const str of resp.body) {
        buf.append(str);
        if (progressProc != null && resp.ok) progressProc(buf.size);
      }
    }
    const io = buf.io;
    io.rewind();
    io.status = [String(resp.status), resp.statusText];
    resp.headers.forEach((value, name) => io.metaAddField2(name, [value]));
    if (resp.ok) return;
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      let locUri: Generic;
      try {
        locUri = URI.parse(resp.headers.get("location") ?? "");
      } catch (error) {
        if (error instanceof InvalidURIError) {
          throw new HTTPError(`${io.status.join(" ")} (Invalid Location URI)`, io);
        }
        throw error;
      }
      throw new OpenUriRedirect(locUri);
    } else {
      throw new HTTPError(io.status.join(" "), io);
    }
  },

  /** @noRailsEquivalent PERMANENT */
  HTTPError,
  /** @noRailsEquivalent PERMANENT */
  HTTPRedirect,
  /** @noRailsEquivalent PERMANENT */
  TooManyRedirects,
  /** @noRailsEquivalent PERMANENT */
  Buffer,
  /** @noRailsEquivalent PERMANENT */
  Meta,
  /** @noRailsEquivalent PERMANENT */
  OpenRead,
};

declare module "./uri/http.js" {
  interface HTTP extends OpenRead {
    bufferOpen(buf: Buffer, proxy: unknown, options: OpenUriOptions): Promise<void>;
  }
}

/**
 * `URI::HTTP#buffer_open` (`vendor/ruby/v3.3.11/lib/open-uri.rb:769-771`).
 *
 * @noRailsEquivalent PERMANENT
 */
HTTP.prototype.bufferOpen = function (
  this: HTTP,
  buf: Buffer,
  proxy: unknown,
  options: OpenUriOptions,
): Promise<void> {
  return OpenURI.openHttp(buf, this, proxy, options);
};
include(HTTP, OpenRead);
