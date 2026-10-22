import type { HttpSocket } from "./http-adapter.js";
import { IO } from "./io.js";
import { IOError } from "./io-error.js";

/**
 * Ruby's `BasicSocket` (`vendor/ruby/v3.3.11/ext/socket/basicsocket.c:746`), an
 * `IO` subclass, over the HTTP adapter's socket. A Node socket is read by its
 * `data` events, never by a blocking `read(2)`, so the bytes it delivers are
 * buffered as they arrive: {@link read} answers what has arrived, as
 * `read_nonblock` would, and {@link waitReadable} is the wait a blocking read
 * does in Ruby.
 *
 * @noRailsEquivalent PERMANENT
 */
export class BasicSocket extends IO {
  private readonly _socket: HttpSocket;
  private _rbuf: Uint8Array[] = [];
  private _eof = false;
  private _closed = false;
  private _readClosed = false;
  private _writeClosed = false;
  private _waiting: (() => void)[] = [];

  /** @noRailsEquivalent PERMANENT */
  constructor(socket: HttpSocket) {
    super(-1, null, "r+b");
    this.binmode();
    this._socket = socket;
    socket.on("data", (chunk) => {
      if (!this._readClosed) this._rbuf.push(chunk);
      this._wake();
    });
    socket.on("end", () => {
      this._eof = true;
      this._wake();
    });
    socket.on("error", () => {
      this._eof = true;
      this._wake();
    });
    socket.on("close", () => {
      this._eof = true;
      this._wake();
    });
  }

  /**
   * `IO#read` (`vendor/ruby/v3.3.11/io.c:3731` `io_read`) over the bytes
   * delivered so far. With no length it answers all of them, an empty
   * ASCII-8BIT String once the peer has finished; with one, at most that
   * many, and `nil` at end of file. A closed read side raises `IOError`
   * (`io.c:1029` `rb_io_check_char_readable`).
   *
   * @noRailsEquivalent PERMANENT
   */
  override read(): string | Uint8Array;
  override read(length: null, str?: Uint8Array | null): string | Uint8Array;
  override read(length: number, str?: Uint8Array | null): Uint8Array | null;
  override read(length: number | null, str?: Uint8Array | null): string | Uint8Array | null;
  override read(length?: number | null, str?: Uint8Array | null): string | Uint8Array | null {
    if (this._closed || this._readClosed) throw new IOError("closed stream");
    const buffered = this._rbuf.reduce((n, chunk) => n + chunk.length, 0);
    if (length == null) length = buffered;
    else if (buffered === 0 && length > 0 && this._eof) return null;
    const out = new Uint8Array(Math.min(length, buffered));
    let n = 0;
    while (n < out.length) {
      const chunk = this._rbuf[0];
      const take = Math.min(chunk.length, out.length - n);
      out.set(chunk.subarray(0, take), n);
      n += take;
      if (take === chunk.length) this._rbuf.shift();
      else this._rbuf[0] = chunk.subarray(take);
    }
    if (str) str.set(out.subarray(0, str.length));
    return out;
  }

  /**
   * `IO#wait_readable` (`vendor/ruby/v3.3.11/io.c:15559` `io_wait_readable`):
   * resolves with the socket once a byte or end of file can be read.
   *
   * @noRailsEquivalent PERMANENT
   */
  waitReadable(): Promise<this> {
    if (this._rbuf.length > 0 || this._eof) return Promise.resolve(this);
    return new Promise((resolve) => this._waiting.push(() => resolve(this)));
  }

  /**
   * `IO#write` (`vendor/ruby/v3.3.11/io.c:2263` `io_write_m`); a closed write
   * side raises `IOError` (`io.c:1009` `rb_io_check_writable`).
   *
   * @noRailsEquivalent PERMANENT
   */
  override write(string: string | Uint8Array): number {
    if (this._closed || this._writeClosed) throw new IOError("closed stream");
    const buffer = typeof string === "string" ? new TextEncoder().encode(string) : string;
    this._socket.write(buffer);
    return buffer.length;
  }

  /** @noRailsEquivalent PERMANENT */
  override isClosed(): boolean {
    return this._closed;
  }

  /** @noRailsEquivalent PERMANENT */
  override close(): null {
    if (this._closed) return null;
    this._closed = true;
    this._socket.destroy();
    return null;
  }

  /**
   * `bsock_close_read` (`vendor/ruby/v3.3.11/ext/socket/basicsocket.c:122`):
   * `shutdown(SHUT_RD)`, and the whole socket once the write side is shut
   * too. Node has no read-side shutdown, so the buffered bytes are dropped
   * and no more are read.
   *
   * @noRailsEquivalent PERMANENT
   */
  closeRead(): null {
    if (this._closed) throw new IOError("closed stream");
    if (this._writeClosed) return this.close();
    this._readClosed = true;
    this._rbuf = [];
    this._eof = true;
    this._wake();
    return null;
  }

  /**
   * `bsock_close_write` (`vendor/ruby/v3.3.11/ext/socket/basicsocket.c:152`):
   * `shutdown(SHUT_WR)`, a half-close the peer reads as end of file.
   *
   * @noRailsEquivalent PERMANENT
   */
  closeWrite(): null {
    if (this._closed) throw new IOError("closed stream");
    if (this._readClosed) return this.close();
    this._writeClosed = true;
    this._socket.end();
    return null;
  }

  private _wake(): void {
    for (const wake of this._waiting.splice(0)) wake();
  }
}

/**
 * Ruby's `TCPSocket` (`vendor/ruby/v3.3.11/ext/socket/tcpsocket.c:108`), the
 * `BasicSocket` a Ruby server hands a `rack.hijack` caller.
 *
 * @noRailsEquivalent PERMANENT
 */
export class TCPSocket extends BasicSocket {}
