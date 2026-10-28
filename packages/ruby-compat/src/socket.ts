import type { HttpSocket } from "./http-adapter.js";
import { ArgumentError } from "./argument-error.js";
import { EOFError } from "./eof-error.js";
import { Errno } from "./errno.js";
import { IO } from "./io.js";
import { IOError } from "./io-error.js";
import { rbInspect, rbObjAsString } from "./object.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { getProcessAdapter } from "./process-adapter.js";

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
  private _peerGone = false;
  private _hostError: Error | null = null;
  private _writeWaiting: (() => void)[] = [];

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
    socket.on("error", (error) => {
      this._hostError = error;
      this._eof = true;
      this._wake();
    });
    socket.on("close", () => {
      this._eof = true;
      this._wake();
      this._peerGone = true;
      this._wakeWriters();
    });
    socket.on("drain", () => this._wakeWriters());
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
   * `IO#read` as Ruby's blocking `io_read` (`vendor/ruby/v3.3.11/io.c:3731`)
   * answers it: waits until `length` bytes have arrived, or end of file, then
   * reads them as {@link read} does, so fewer come back only at end of file.
   * With no length it waits for end of file. A Node socket cannot block a
   * read, so this is its awaited form, as `rbFLoad` is `Kernel#load`'s.
   *
   * @noRailsEquivalent PERMANENT
   */
  async readBlocking(
    length?: number | null,
    str?: Uint8Array | null,
  ): Promise<string | Uint8Array | null> {
    while (
      !this._eof &&
      !this._closed &&
      !this._readClosed &&
      (length == null || this._rbufLength < length)
    ) {
      await new Promise<void>((resolve) => this._waiting.push(resolve));
    }
    return this.read(length ?? null, str);
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

  /**
   * `IO#write_nonblock` (`vendor/ruby/v3.3.11/io.rb:120`, `io.c:3666`
   * `io_write_nonblock`). A `buf` that is not a String is sent `to_s` first
   * (`rb_obj_as_string`, `io.c:3671-3672`); then a non-boolean `exception`
   * raises `ArgumentError` (`rb_bool_expected`, `io.c:3673`, `object.c:3320-3335`), and an
   * empty `buf` answers 0 without regard to room, as a zero-length
   * `write(2)` does (`io.c:3682-3699`). The socket's write queue below its high-water mark
   * stands in for the kernel's send buffer: as many bytes as fit there are
   * written and their count answered, which is short when `buf` does not
   * fit (`io.rb:76-79`). With no room it raises `IO::EAGAINWaitWritable`
   * ("write would block", `io.c:3693`), or answers `:wait_writable` under
   * `exception: false` (`io.c:3690`). Once the peer has gone the write fails
   * whatever `exception` says (`io.c:3696`), with the host's own error when
   * the socket reported one — its `code` makes it `Errno::EPIPE` or
   * `Errno::ECONNRESET` to a `rescue` — and otherwise `Errno::EPIPE`, what
   * `write(2)` answers on a connection that has been closed.
   *
   * @noRailsEquivalent PERMANENT
   */
  writeNonblock(
    buf: unknown,
    { exception = true }: { exception?: boolean } = {},
  ): number | "wait_writable" {
    const str: string | Uint8Array = rbObjAsString(buf);
    if (exception !== true && exception !== false) {
      throw new ArgumentError(`expected true or false as exception: ${rbInspect(exception)}`);
    }
    if (this._closed || this._writeClosed) throw new IOError("closed stream");
    if (this._peerGone) throw this._hostError ?? new Errno.EPIPE();
    const bytes = typeof str === "string" ? new TextEncoder().encode(str) : str;
    if (bytes.length === 0) return 0;
    const room = this._socket.writableHighWaterMark - this._socket.writableLength;
    if (room <= 0) {
      if (!exception) return "wait_writable";
      throw new IO.EAGAINWaitWritable("write would block");
    }
    const written = Math.min(room, bytes.length);
    this._socket.write(bytes.subarray(0, written));
    return written;
  }

  /**
   * `IO#wait_writable` (`vendor/ruby/v3.3.11/io.c:9766` `io_wait_writable`):
   * resolves with the socket once a write would not block — at once while
   * the write queue is below its high-water mark, otherwise when it drains
   * or the peer goes, as `select(2)` reports a reset socket writable — or
   * with `nil` once `timeout` seconds pass first (`io.c:9710-9716`). A
   * closed write side raises `IOError` (`rb_io_check_writable`, `io.c:9771`),
   * then a negative timeout `ArgumentError` (`rb_time_interval`,
   * `io.c:1445-1446`, `time.c:2852`), both before any wait; a socket closed
   * during the wait raises after it (`io.c:1451-1458`).
   *
   * @noRailsEquivalent PERMANENT
   */
  async waitWritable(timeout: number | null = null): Promise<this | null> {
    if (this._closed || this._writeClosed) throw new IOError("closed stream");
    if (timeout !== null && timeout < 0)
      throw new ArgumentError("time interval must not be negative");
    const full = this._socket.writableLength >= this._socket.writableHighWaterMark;
    if (full && !this._peerGone) {
      const ready = await new Promise<boolean>((resolve) => {
        const wake = (): void => {
          if (timer !== null) clearTimeout(timer);
          resolve(true);
        };
        const timer =
          timeout === null
            ? null
            : setTimeout(() => {
                this._writeWaiting.splice(this._writeWaiting.indexOf(wake), 1);
                resolve(false);
              }, timeout * 1000);
        this._writeWaiting.push(wake);
      });
      if (this._closed) throw new IOError("closed stream");
      if (!ready) return null;
    }
    return this;
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

  private _wakeWriters(): void {
    for (const wake of this._writeWaiting.splice(0)) wake();
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

/**
 * @noRailsEquivalent PERMANENT — Ruby core `Socket`
 * (`vendor/ruby/v3.3.11/ext/socket/socket.c:1983`).
 */
export class Socket extends BasicSocket {
  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Socket.gethostname`
   * (`vendor/ruby/v3.3.11/ext/socket/socket.c:847`).
   */
  static gethostname(): string {
    const adapter = getProcessAdapter();
    if (adapter.hostname == null) {
      throw new NotImplementedError("gethostname() function is unimplemented on this machine");
    }
    return adapter.hostname();
  }
}
