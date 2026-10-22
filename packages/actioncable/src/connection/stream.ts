import { EOFError, Errno, rbModConstSet } from "@blazetrails/ruby-compat";
import { Connection } from "../namespaces.js";

type Data = string | Uint8Array;

interface Io {
  write(data: Data): unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
  destroy(): unknown;
}

interface EventLoop {
  attach(io: Io, stream: Stream): unknown;
  detach(io: Io, stream: Stream): unknown;
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

  /** @missingRailsCall new — PERMANENT */
  constructor(eventLoop: EventLoop, socket: SocketObject) {
    this.eventLoop = eventLoop;
    this.socketObject = socket;
    this.streamSend = (socket.env["stream.send"] as StreamSend | undefined) ?? null;

    this.rackHijackIo = null;
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

      this.rackHijackIo!.write(data);

      return typeof data === "string" ? new TextEncoder().encode(data).length : data.length;
    } catch (error) {
      if (error instanceof EOFError || error instanceof Errno.ECONNRESET) {
        return this.socketObject.clientGone();
      }
      throw error;
    }
  }

  receive(data: Data): unknown {
    return this.socketObject.parse(data);
  }

  hijackRackSocket(): unknown {
    if (!this.socketObject.env["rack.hijack"]) return;

    this.rackHijackIo = (this.socketObject.env["rack.hijack"] as () => Io | null)();
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

rbModConstSet(Connection, "Stream", Stream);
