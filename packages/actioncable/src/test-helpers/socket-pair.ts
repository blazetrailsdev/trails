import { TCPSocket, type HttpSocket } from "@blazetrails/ruby-compat";

type Listener = (arg: never) => void;

class PairedSocket implements HttpSocket {
  peer!: PairedSocket;
  private _listeners = new Map<string, Listener[]>();
  private _destroyed = false;
  readonly writableLength = 0;
  readonly writableHighWaterMark = 16 * 1024;

  write(chunk: string | Uint8Array): boolean {
    const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    queueMicrotask(() => this.peer.emit("data", bytes));
    return true;
  }

  end(): void {
    queueMicrotask(() => this.peer.emit("end"));
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.emit("close");
    this.end();
  }

  unshift(): void {}
  pause(): void {}
  resume(): void {}

  on(event: string, listener: Listener): this {
    this._listeners.set(event, [...(this._listeners.get(event) ?? []), listener]);
    return this;
  }

  removeListener(event: string, listener: Listener): this {
    this._listeners.set(
      event,
      (this._listeners.get(event) ?? []).filter((l) => l !== listener),
    );
    return this;
  }

  private emit(event: string, arg?: unknown): void {
    for (const listener of this._listeners.get(event) ?? [])
      (listener as (arg?: unknown) => void)(arg);
  }
}

export function socketPair(): [TCPSocket, TCPSocket] {
  const a = new PairedSocket();
  const b = new PairedSocket();
  a.peer = b;
  b.peer = a;
  return [new TCPSocket(a), new TCPSocket(b)];
}
