import { EOFError, Errno, Mutex, Queue, rbDeclareIvar } from "@blazetrails/ruby-compat";

type Data = string | Uint8Array;

interface Io {
  writeNonblock(data: Data, options: { exception: false }): number | "wait_writable";
  waitWritable(): Promise<unknown>;
  close(): unknown;
  waitReadable(): Promise<unknown>;
  readNonblock(
    len: number,
    buf: null,
    options: { exception: false },
  ): Uint8Array | "wait_readable" | null;
}

interface EventLoop {
  attach(io: Io, stream: Stream): unknown;
  detach(io: Io, stream: Stream): unknown;
  writesPending(io: Io): unknown;
}

interface SocketObject {
  env: Record<string, unknown>;
  clientGone(): unknown;
  parse(data: Data): unknown;
}

type StreamSend = (data: Data) => unknown;

export class Stream {
  private eventLoop: EventLoop;
  private socketObject: SocketObject;
  private streamSend: StreamSend | null;
  private rackHijackIo: Io | null;
  private _writeLock: Mutex;
  private _writeHead: Uint8Array | null;
  private _writeBuffer: Queue<Data>;

  constructor(eventLoop: EventLoop, socket: SocketObject) {
    this.eventLoop = eventLoop;
    this.socketObject = socket;
    this.streamSend = (socket.env["stream.send"] as StreamSend | undefined) ?? null;

    this.rackHijackIo = null;
    this._writeLock = new Mutex();

    this._writeHead = null;
    this._writeBuffer = new Queue();
  }

  each(callback: StreamSend): StreamSend {
    return (this.streamSend ??= callback);
  }

  close(): void {
    this.shutdown();
    this.socketObject.clientGone();
  }

  shutdown(): void {
    this.cleanRackHijack();
  }

  write(data: Data): unknown {
    try {
      if (this.streamSend) {
        return this.streamSend(data);
      }

      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      if (this._writeLock.tryLock()) {
        try {
          if (this._writeHead == null && this._writeBuffer.isEmpty()) {
            const written = this.rackHijackIo!.writeNonblock(data, { exception: false });

            switch (written) {
              case "wait_writable":
                break;
              case bytes.length:
                return bytes.length;
              default:
                this._writeHead = bytes.subarray(written, bytes.length);
                this.eventLoop.writesPending(this.rackHijackIo!);

                return bytes.length;
            }
          }
        } finally {
          this._writeLock.unlock();
        }
      }

      void this._writeBuffer.push(data);
      this.eventLoop.writesPending(this.rackHijackIo!);

      return bytes.length;
    } catch (error) {
      if (error instanceof EOFError || error instanceof Errno.ECONNRESET) {
        return this.socketObject.clientGone();
      }
      throw error;
    }
  }

  flushWriteBuffer(): boolean {
    return this._writeLock.synchronize(() => {
      for (;;) {
        if (this._writeHead == null) {
          if (this._writeBuffer.isEmpty()) return true;
          const data = this._writeBuffer.pop(true);
          this._writeHead = typeof data === "string" ? new TextEncoder().encode(data) : data;
        }

        const written = this.rackHijackIo!.writeNonblock(this._writeHead, { exception: false });
        switch (written) {
          case "wait_writable":
            return false;
          case this._writeHead.length:
            this._writeHead = null;
            break;
          default:
            this._writeHead = this._writeHead.subarray(written, this._writeHead.length);
            return false;
        }
      }
    }) as boolean;
  }

  receive(data: Data): unknown {
    return this.socketObject.parse(data);
  }

  hijackRackSocket(): unknown {
    if (!this.socketObject.env["rack.hijack"]) return;

    this.rackHijackIo = (this.socketObject.env["rack.hijack"] as () => Io | null).call(null);
    this.rackHijackIo ??= this.socketObject.env["rack.hijack_io"] as Io;

    return this.eventLoop.attach(this.rackHijackIo, this);
  }

  /** @internal */
  private cleanRackHijack(): void {
    if (!this.rackHijackIo) return;
    this.eventLoop.detach(this.rackHijackIo, this);
    this.rackHijackIo = null;
  }
}

rbDeclareIvar(Stream, "@write_lock", "_writeLock");
rbDeclareIvar(Stream, "@write_head", "_writeHead");
rbDeclareIvar(Stream, "@write_buffer", "_writeBuffer");
