import type { HttpSocket } from "./http-adapter.js";
import { ArgumentError } from "./argument-error.js";
import { EOFError } from "./eof-error.js";
import { IO } from "./io.js";
import { IOError } from "./io-error.js";

const HIGH_WATER_MARK = 64 * 1024;

/**
 * Ruby's `BasicSocket` (`vendor/ruby/v3.3.11/ext/socket/basicsocket.c:746`), an
 * `IO` subclass, over the HTTP adapter's socket. A Node socket is read by its
 * `data` events, never by a blocking `read(2)`, so the bytes it delivers are
 * buffered as they arrive: {@link read} answers what has arrived, as
 * `read_nonblock` would, and {@link waitReadable} is the wait a blocking read
 * does in Ruby. Above a high-water mark of buffered bytes the socket is
 * paused, as a kernel's full receive buffer stops the peer, and resumed once
 * a read drains it below the mark.
 *
 * @noRailsEquivalent PERMANENT
 */
export class BasicSocket extends IO {
  private readonly _socket: HttpSocket;
  private _rbuf: Uint8Array[] = [];
  private _rbufLength = 0;
  private _paused = false;
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
      if (!this._readClosed) {
        this._rbuf.push(chunk);
        this._rbufLength += chunk.length;
        if (this._rbufLength > HIGH_WATER_MARK && !this._paused) {
          this._paused = true;
          socket.pause();
        }
      }
      this._wake();
    });
    socket.resume();
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
   * (`io.c:1029` `rb_io_check_char_readable`). The `str` buffer receives the
   * bytes as `IO#read` fills it: up to its own length, since a `Uint8Array`
   * cannot be resized, and zero-filled at end of file, where `io_read`
   * empties the String (`io.c:3800`). The return value holds exactly the
   * bytes read, so a short read leaves the buffer's tail as it was.
   *
   * @noRailsEquivalent PERMANENT
   */
  override read(): string | Uint8Array;
  override read(length: null, str?: Uint8Array | null): string | Uint8Array;
  override read(length: number, str?: Uint8Array | null): Uint8Array | null;
  override read(length: number | null, str?: Uint8Array | null): string | Uint8Array | null;
  override read(length?: number | null, str?: Uint8Array | null): string | Uint8Array | null {
    if (this._closed || this._readClosed) throw new IOError("closed stream");
    if (length == null) length = this._rbufLength;
    else if (this._rbufLength === 0 && length > 0 && this._eof) {
      if (str) str.fill(0);
      return null;
    }
    const out = this._shift(length);
    if (str) str.set(out.subarray(0, str.length));
    return out;
  }

  /**
   * `IO#read_nonblock` (`vendor/ruby/v3.3.11/io.rb:62`, `io.c:3611`
   * `io_read_nonblock`): at most `len` of the bytes delivered so far. With
   * none buffered it raises `IO::EAGAINWaitReadable` ("read would block",
   * `io.c:3648`), or answers `:wait_readable` under `exception: false`
   * (`io.c:3647`); at end of file it raises `EOFError`, or answers `nil`
   * (`io.c:3656-3659`). `buf` is filled as {@link read} fills its `str`.
   *
   * @noRailsEquivalent PERMANENT
   */
  readNonblock(
    len: number,
    buf: Uint8Array | null = null,
    { exception = true }: { exception?: boolean } = {},
  ): Uint8Array | "wait_readable" | null {
    if (len < 0) throw new ArgumentError(`negative length ${len} given`);
    if (this._closed || this._readClosed) throw new IOError("closed stream");
    if (len === 0) return new Uint8Array(0);
    if (this._rbufLength === 0) {
      if (!this._eof) {
        if (!exception) return "wait_readable";
        throw new IO.EAGAINWaitReadable("read would block");
      }
      if (buf) buf.fill(0);
      if (!exception) return null;
      throw new EOFError("end of file reached");
    }
    const out = this._shift(len);
    if (buf) buf.set(out.subarray(0, buf.length));
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
    this._rbufLength = 0;
    if (this._paused) {
      this._paused = false;
      this._socket.resume();
    }
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

  private _shift(length: number): Uint8Array {
    const out = new Uint8Array(Math.min(length, this._rbufLength));
    let n = 0;
    while (n < out.length) {
      const chunk = this._rbuf[0];
      const take = Math.min(chunk.length, out.length - n);
      out.set(chunk.subarray(0, take), n);
      n += take;
      if (take === chunk.length) this._rbuf.shift();
      else this._rbuf[0] = chunk.subarray(take);
    }
    this._rbufLength -= n;
    if (this._paused && this._rbufLength <= HIGH_WATER_MARK) {
      this._paused = false;
      this._socket.resume();
    }
    return out;
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
