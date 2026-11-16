import { rbInspect } from "../object.js";
import { constSet } from "../include.js";
import { TopLevel } from "../object.js";
import { Timeout } from "../timeout.js";
import { EOFError } from "../eof-error.js";
import { StandardError } from "../standard-error.js";
import { strNew } from "../string/bytes.js";
import { rbStrDump } from "../string/convert.js";
import type { HttpClientSocket, HttpDebugOutput } from "../http-adapter.js";
import type { SSLSocket } from "../openssl.js";
import type { HTTP, HTTPBadResponse, HTTPHeaderSyntaxError } from "./http.js";
import type { HTTPResponse } from "./http/response.js";
import type * as Responses from "./http/responses.js";
import type * as Exceptions from "./http/exceptions.js";
import type { Post } from "./http/requests.js";

/**
 * `Net::OpenTimeout` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:74`), raised when a
 * connection cannot be created within `open_timeout`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails rescues without defining.
 */
export class OpenTimeout extends Timeout.Error {}

OpenTimeout.prototype.name = "Net::OpenTimeout";

/**
 * `Net::ReadTimeout` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:80-94`), raised when
 * a response cannot be read within `read_timeout`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails rescues without defining.
 */
export class ReadTimeout extends Timeout.Error {
  /** @noRailsEquivalent PERMANENT */
  readonly io: unknown;

  /** @noRailsEquivalent PERMANENT */
  constructor(io: unknown = null) {
    super(io != null ? `Net::ReadTimeout with ${rbInspect(io)}` : "Net::ReadTimeout");
    this.io = io;
  }
}

ReadTimeout.prototype.name = "Net::ReadTimeout";

/**
 * `Net::WriteTimeout` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:99-113`), raised
 * when a chunk of the request cannot be written within `write_timeout`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails rescues without defining.
 */
export class WriteTimeout extends Timeout.Error {
  /** @noRailsEquivalent PERMANENT */
  readonly io: unknown;

  /** @noRailsEquivalent PERMANENT */
  constructor(io: unknown = null) {
    super(io != null ? `Net::WriteTimeout with ${rbInspect(io)}` : "Net::WriteTimeout");
    this.io = io;
  }
}

WriteTimeout.prototype.name = "Net::WriteTimeout";

/**
 * `Net::ReadAdapter` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:516-537`), the
 * `dest` `read_body` streams into when it is given a block.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class ReadAdapter {
  private readonly _block: ((str: Uint8Array) => unknown) | null;

  /** @noRailsEquivalent PERMANENT */
  constructor(block: ((str: Uint8Array) => unknown) | null) {
    this._block = block;
  }

  /** @noRailsEquivalent PERMANENT */
  inspect(): string {
    return `#<${this.constructor.name}>`;
  }

  /** @noRailsEquivalent PERMANENT */
  async append(str: Uint8Array): Promise<unknown> {
    if (this._block) return this._block(str);
    return null;
  }
}

/** @noRailsEquivalent PERMANENT */
type BufferedIODest = { append(str: Uint8Array): unknown } | Uint8Array[];

/**
 * `Net::Protocol` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:28-57`), the
 * superclass of `Net::HTTP` and `Net::SMTP`.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Protocol {
  /** @noRailsEquivalent PERMANENT */
  static readonly VERSION: string = "0.2.2";

  /**
   * `vendor/ruby/v3.3.11/lib/net/protocol.rb:40-56`. The
   * `connect_nonblock` / `wait_readable` loop against the remaining `timeout`
   * is `connect` raced against it.
   *
   * @internal @noRailsEquivalent PERMANENT
   */
  protected async sslSocketConnect(s: SSLSocket, timeout: number | null): Promise<void> {
    if (timeout != null) {
      if (timeout <= 0) throw new OpenTimeout();
      await Timeout.timeout(timeout, OpenTimeout, null, () => s.connect());
    } else {
      await s.connect();
    }
  }
}

/**
 * `Net::BufferedIO` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:116-375`), the
 * reader and writer `Net::HTTP` speaks HTTP/1.1 through, over the adapter's
 * socket.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export class BufferedIO {
  /** @noRailsEquivalent PERMANENT */
  readonly io: HttpClientSocket;
  /** @noRailsEquivalent PERMANENT */
  readTimeout: number | null;
  /** @noRailsEquivalent PERMANENT */
  writeTimeout: number | null;
  /** @noRailsEquivalent PERMANENT */
  continueTimeout: number | null;
  /** @noRailsEquivalent PERMANENT */
  debugOutput: HttpDebugOutput | null;
  private _rbuf = new Uint8Array(0);
  private _rbufOffset = 0;
  private _rbufEmpty = true;
  private _writtenBytes: number | null = null;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    io: HttpClientSocket,
    {
      readTimeout = 60,
      writeTimeout = 60,
      continueTimeout = null,
      debugOutput = null,
    }: {
      readTimeout?: number | null;
      writeTimeout?: number | null;
      continueTimeout?: number | null;
      debugOutput?: HttpDebugOutput | null;
    } = {},
  ) {
    this.io = io;
    this.readTimeout = readTimeout;
    this.writeTimeout = writeTimeout;
    this.continueTimeout = continueTimeout;
    this.debugOutput = debugOutput;
  }

  /** @noRailsEquivalent PERMANENT */
  inspect(): string {
    return `#<${this.constructor.name} io=${this.io.inspect()}>`;
  }

  /** @noRailsEquivalent PERMANENT */
  isEof(): boolean {
    return this.io.isEof();
  }

  /** @noRailsEquivalent PERMANENT */
  isClosed(): boolean {
    return this.io.isClosed();
  }

  /** @noRailsEquivalent PERMANENT */
  close(): void {
    this.io.close();
  }

  /** @noRailsEquivalent PERMANENT */
  async read(len: number, dest: BufferedIODest = [], ignoreEof = false): Promise<BufferedIODest> {
    this.LOG(`reading ${len} bytes...`);
    let readBytes = 0;
    try {
      while (readBytes + this.rbufSize() < len) {
        const s = this.rbufConsumeAll();
        if (s != null) {
          readBytes += s.length;
          if (Array.isArray(dest)) dest.push(s);
          else await dest.append(s);
        }
        await this.rbufFill();
      }
      const s = this.rbufConsume(len - readBytes);
      readBytes += s.length;
      if (Array.isArray(dest)) dest.push(s);
      else await dest.append(s);
    } catch (e) {
      if (!(e instanceof EOFError) || !ignoreEof) throw e;
    }
    this.LOG(`read ${readBytes} bytes`);
    return dest;
  }

  /** @noRailsEquivalent PERMANENT */
  async readAll(dest: BufferedIODest = []): Promise<BufferedIODest> {
    this.LOG("reading all...");
    let readBytes = 0;
    try {
      for (;;) {
        const s = this.rbufConsumeAll();
        if (s != null) {
          readBytes += s.length;
          if (Array.isArray(dest)) dest.push(s);
          else await dest.append(s);
        }
        await this.rbufFill();
      }
    } catch (e) {
      if (!(e instanceof EOFError)) throw e;
    }
    this.LOG(`read ${readBytes} bytes`);
    return dest;
  }

  /** @noRailsEquivalent PERMANENT */
  async readuntil(terminator: string, ignoreEof = false): Promise<string> {
    const term = new TextEncoder().encode(terminator);
    const index = (from: number) => {
      if (term.length === 0) return from;
      let i = from - 1;
      while ((i = this._rbuf.indexOf(term[0], i + 1)) !== -1) {
        if (term.every((b, j) => this._rbuf[i + j] === b)) return i;
      }
      return null;
    };
    let offset = this._rbufOffset;
    try {
      let idx: number | null;
      while ((idx = index(offset)) == null) {
        offset = this._rbuf.length;
        await this.rbufFill();
      }
      return strNew(this.rbufConsume(idx + term.length - this._rbufOffset));
    } catch (e) {
      if (!(e instanceof EOFError) || !ignoreEof) throw e;
      return strNew(this.rbufConsume());
    }
  }

  /** @noRailsEquivalent PERMANENT */
  async readline(): Promise<string> {
    return (await this.readuntil("\n")).replace(/\r?\n$/, "");
  }

  /** @internal */
  private async rbufFill(): Promise<void> {
    for (;;) {
      const rv = this.io.readNonblock();
      if (rv instanceof Uint8Array) {
        this._rbufEmpty = false;
        const rbuf = new Uint8Array(this._rbuf.length + rv.length);
        rbuf.set(this._rbuf);
        rbuf.set(rv, this._rbuf.length);
        this._rbuf = rbuf;
        return;
      } else if (rv === "wait_readable") {
        if (!(await this.io.waitReadable(this.readTimeout))) throw new ReadTimeout(this.io);
      } else if (rv === "wait_writable") {
        if (!(await this.io.waitWritable(this.readTimeout))) throw new ReadTimeout(this.io);
      } else {
        throw new EOFError("end of file reached");
      }
    }
  }

  /** @internal */
  private rbufFlush(): null {
    if (this._rbufEmpty) {
      this._rbuf = new Uint8Array(0);
      this._rbufOffset = 0;
    }
    return null;
  }

  /** @internal */
  private rbufSize(): number {
    return this._rbuf.length - this._rbufOffset;
  }

  /** @internal */
  private rbufConsumeAll(): Uint8Array | null {
    return this.rbufSize() > 0 ? this.rbufConsume() : null;
  }

  /** @internal */
  private rbufConsume(len: number | null = null): Uint8Array {
    let s: Uint8Array;
    if (this._rbufOffset === 0 && (len == null || len === this._rbuf.length)) {
      s = this._rbuf;
      this._rbuf = new Uint8Array(0);
      this._rbufOffset = 0;
      this._rbufEmpty = true;
    } else if (len == null) {
      s = this._rbuf.subarray(this._rbufOffset);
      this._rbuf = new Uint8Array(0);
      this._rbufOffset = 0;
      this._rbufEmpty = true;
    } else {
      s = this._rbuf.subarray(this._rbufOffset, this._rbufOffset + len);
      this._rbufOffset += len;
      this._rbufEmpty = this._rbufOffset === this._rbuf.length;
      this.rbufFlush();
    }
    this.debugOutput?.write(`-> ${rbStrDump(strNew(s))}\n`);
    return s;
  }

  /** @noRailsEquivalent PERMANENT */
  async write(...strs: (string | Uint8Array)[]): Promise<number> {
    return this.writing(() => this.write0(...strs));
  }

  /** @internal */
  private async writing(block: () => Promise<unknown>): Promise<number> {
    this._writtenBytes = 0;
    this.debugOutput?.write("<- ");
    await block();
    this.debugOutput?.write("\n");
    const bytes = this._writtenBytes;
    this._writtenBytes = null;
    return bytes;
  }

  /**
   * `vendor/ruby/v3.3.11/lib/net/protocol.rb:314-345`. A Node socket takes
   * every byte it is handed and answers whether its buffer is past the high
   * water mark, so the partial-write retry is the wait for `drain`.
   *
   * @inventedArm if — PERMANENT
   * @internal @noRailsEquivalent PERMANENT
   */
  private async write0(...strs: (string | Uint8Array)[]): Promise<number> {
    this.debugOutput?.write(
      strs.map((s) => rbStrDump(typeof s === "string" ? s : strNew(s))).join(""),
    );
    const origWrittenBytes = this._writtenBytes!;
    for (const str of strs) {
      const bytes = typeof str === "string" ? new TextEncoder().encode(str) : str;
      if (!this.io.writeNonblock(bytes) && !(await this.io.waitWritable(this.writeTimeout))) {
        throw new WriteTimeout(this.io);
      }
      this._writtenBytes! += bytes.length;
    }
    return this._writtenBytes! - origWrittenBytes;
  }

  /** @internal @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/net/protocol.rb:356-359`. */
  private LOG(msg: string): void {
    this.debugOutput?.write(msg + "\n");
  }
}

/** @noRailsEquivalent PERMANENT — `Net::ProtocolError` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:60`). */
export class ProtocolError extends StandardError {}
ProtocolError.prototype.name = "Net::ProtocolError";

/** @noRailsEquivalent PERMANENT — `Net::ProtoSyntaxError` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:61`). */
export class ProtoSyntaxError extends ProtocolError {}
ProtoSyntaxError.prototype.name = "Net::ProtoSyntaxError";

/** @noRailsEquivalent PERMANENT — `Net::ProtoFatalError` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:62`). */
export class ProtoFatalError extends ProtocolError {}
ProtoFatalError.prototype.name = "Net::ProtoFatalError";

/** @noRailsEquivalent PERMANENT — `Net::ProtoUnknownError` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:63`). */
export class ProtoUnknownError extends ProtocolError {}
ProtoUnknownError.prototype.name = "Net::ProtoUnknownError";

/** @noRailsEquivalent PERMANENT — `Net::ProtoServerError` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:64`). */
export class ProtoServerError extends ProtocolError {}
ProtoServerError.prototype.name = "Net::ProtoServerError";

/** @noRailsEquivalent PERMANENT — `Net::ProtoAuthError` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:65`). */
export class ProtoAuthError extends ProtocolError {}
ProtoAuthError.prototype.name = "Net::ProtoAuthError";

/** @noRailsEquivalent PERMANENT — `Net::ProtoCommandError` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:66`). */
export class ProtoCommandError extends ProtocolError {}
ProtoCommandError.prototype.name = "Net::ProtoCommandError";

/** @noRailsEquivalent PERMANENT — `Net::ProtoRetriableError` (`vendor/ruby/v3.3.11/lib/net/protocol.rb:67`). */
export class ProtoRetriableError extends ProtocolError {}
ProtoRetriableError.prototype.name = "Net::ProtoRetriableError";

/**
 * Ruby's `Net` module (`vendor/ruby/v3.3.11/lib/net/protocol.rb:26`), each
 * constant seated by the file that defines it.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, which Rails calls without defining.
 */
export const Net = {
  name: "Net",
  Protocol,
  OpenTimeout,
  ReadTimeout,
  WriteTimeout,
  ReadAdapter,
  BufferedIO,
  ProtocolError,
  ProtoSyntaxError,
  ProtoFatalError,
  ProtoUnknownError,
  ProtoServerError,
  ProtoAuthError,
  ProtoCommandError,
  ProtoRetriableError,
} as {
  /** @noRailsEquivalent PERMANENT */
  Protocol: typeof Protocol;
  /** @noRailsEquivalent PERMANENT */
  ProtocolError: typeof ProtocolError;
  /** @noRailsEquivalent PERMANENT */
  ProtoSyntaxError: typeof ProtoSyntaxError;
  /** @noRailsEquivalent PERMANENT */
  ProtoFatalError: typeof ProtoFatalError;
  /** @noRailsEquivalent PERMANENT */
  ProtoUnknownError: typeof ProtoUnknownError;
  /** @noRailsEquivalent PERMANENT */
  ProtoServerError: typeof ProtoServerError;
  /** @noRailsEquivalent PERMANENT */
  ProtoAuthError: typeof ProtoAuthError;
  /** @noRailsEquivalent PERMANENT */
  ProtoCommandError: typeof ProtoCommandError;
  /** @noRailsEquivalent PERMANENT */
  ProtoRetriableError: typeof ProtoRetriableError;
  /** @noRailsEquivalent PERMANENT */
  name: string;
  /** @noRailsEquivalent PERMANENT */
  BufferedIO: typeof BufferedIO;
  /** @noRailsEquivalent PERMANENT */
  HTTPBadResponse: typeof HTTPBadResponse;
  /** @noRailsEquivalent PERMANENT */
  OpenTimeout: typeof OpenTimeout;
  /** @noRailsEquivalent PERMANENT */
  ReadTimeout: typeof ReadTimeout;
  /** @noRailsEquivalent PERMANENT */
  WriteTimeout: typeof WriteTimeout;
  /** @noRailsEquivalent PERMANENT */
  ReadAdapter: typeof ReadAdapter;
  /** @noRailsEquivalent PERMANENT */
  HTTP: typeof HTTP & { Post: typeof Post };
  /** @noRailsEquivalent PERMANENT */
  HTTPResponse: typeof HTTPResponse;
  /** @noRailsEquivalent PERMANENT */
  HTTPHeaderSyntaxError: typeof HTTPHeaderSyntaxError;
} & typeof Responses &
  typeof Exceptions;
constSet(TopLevel, "Net", Net);
