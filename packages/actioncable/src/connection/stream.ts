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
  private writeLock: Mutex;
  private writeHead: Uint8Array | null;
  private writeBuffer: Queue<Data>;

  constructor(eventLoop: EventLoop, socket: SocketObject) {
    this.eventLoop = eventLoop;
    this.socketObject = socket;
    this.streamSend = (socket.env["stream.send"] as StreamSend | undefined) ?? null;

    this.rackHijackIo = null;
    this.writeLock = new Mutex();

    this.writeHead = null;
    this.writeBuffer = new Queue();
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
      if (this.writeLock.tryLock()) {
        try {
          if (this.writeHead == null && this.writeBuffer.isEmpty()) {
            const written = this.rackHijackIo!.writeNonblock(data, { exception: false });

            switch (written) {
              case "wait_writable":
                break;
              case bytes.length:
                return bytes.length;
              default:
                this.writeHead = bytes.subarray(written, bytes.length);
                this.eventLoop.writesPending(this.rackHijackIo!);

                return bytes.length;
            }
          }
        } finally {
          this.writeLock.unlock();
        }
      }

      void this.writeBuffer.push(data);
      this.eventLoop.writesPending(this.rackHijackIo!);

      return bytes.length;
    } catch (error) {
      if (error instanceof EOFError || error instanceof Errno.ECONNRESET) {
        return this.socketObject.clientGone();
      }
      throw error;
    }
  }

  /** @missingRailsArgs pop — PERMANENT */
  flushWriteBuffer(): boolean {
    return this.writeLock.synchronize(() => {
      for (;;) {
        if (this.writeHead == null) {
          if (this.writeBuffer.isEmpty()) return true;
          const data = this.writeBuffer.pop(true);
          this.writeHead = typeof data === "string" ? new TextEncoder().encode(data) : data;
        }

        const written = this.rackHijackIo!.writeNonblock(this.writeHead, { exception: false });
        switch (written) {
          case "wait_writable":
            return false;
          case this.writeHead.length:
            this.writeHead = null;
            break;
          default:
            this.writeHead = this.writeHead.subarray(written, this.writeHead.length);
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

rbDeclareIvar(Stream, "@write_lock", "writeLock");
rbDeclareIvar(Stream, "@write_head", "writeHead");
rbDeclareIvar(Stream, "@write_buffer", "writeBuffer");
