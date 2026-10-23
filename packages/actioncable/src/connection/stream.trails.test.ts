import { describe, expect, it } from "vitest";
import { EOFError, Errno } from "@blazetrails/ruby-compat";
import { Stream } from "./stream.js";
import { StreamEventLoop } from "./stream-event-loop.js";

type Listener = (...args: unknown[]) => void;

class FakeIo {
  listeners = new Map<string, Listener[]>();
  written: unknown[] = [];
  destroyed = false;
  raise: Error | null = null;
  on(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  off(event: string, listener: Listener): void {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((l) => l !== listener),
    );
  }
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
  write(data: unknown): boolean {
    if (this.raise) throw this.raise;
    this.written.push(data);
    return true;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

function setup(env: Record<string, unknown> = {}) {
  const io = new FakeIo();
  const socket = {
    env: { "rack.hijack": () => io, ...env },
    gone: 0,
    parsed: [] as unknown[],
    clientGone() {
      this.gone++;
    },
    parse(data: unknown) {
      this.parsed.push(data);
    },
  };
  const eventLoop = new StreamEventLoop();
  const stream = new Stream(eventLoop, socket);
  return { io, socket, stream };
}

describe("ActionCable::Connection::Stream", () => {
  it("hijacks the rack socket and attaches it to the event loop", () => {
    const { io, socket, stream } = setup();
    stream.hijackRackSocket();
    io.emit("data", "frame");
    expect(socket.parsed).toEqual(["frame"]);
  });

  it("falls back to rack.hijack_io and skips with no rack.hijack", () => {
    const io = new FakeIo();
    const { stream } = setup({ "rack.hijack": () => null, "rack.hijack_io": io });
    stream.hijackRackSocket();
    expect(io.listeners.get("data")).toHaveLength(1);
    const bare = setup({ "rack.hijack": null });
    expect(bare.stream.hijackRackSocket()).toBeUndefined();
  });

  it("writes to the io and returns the byte size", () => {
    const { io, stream } = setup();
    stream.hijackRackSocket();
    expect(stream.write("héllo")).toBe(6);
    expect(stream.write(new Uint8Array([1, 2, 3]))).toBe(3);
    expect(io.written).toEqual(["héllo", new Uint8Array([1, 2, 3])]);
  });

  it("calls client_gone on EOFError or ECONNRESET and raises anything else", () => {
    const { io, socket, stream } = setup();
    stream.hijackRackSocket();
    io.raise = new EOFError("end of file reached");
    stream.write("x");
    io.raise = Object.assign(new Error("reset"), { code: "ECONNRESET" });
    stream.write("x");
    io.raise = new Errno.ECONNRESET();
    stream.write("x");
    expect(socket.gone).toBe(3);
    io.raise = new Error("boom");
    expect(() => stream.write("x")).toThrow("boom");
  });

  it("writes through stream.send when given", () => {
    const sent: unknown[] = [];
    const { stream } = setup({ "stream.send": (d: unknown) => sent.push(d) });
    expect(stream.write("a")).toBe(1);
    expect(stream.each(() => "other")).toBeTypeOf("function");
    expect(sent).toEqual(["a"]);
  });

  it("shutdown detaches and closes the io, once", () => {
    const { io, socket, stream } = setup();
    stream.hijackRackSocket();
    stream.shutdown();
    expect(io.destroyed).toBe(true);
    expect(io.listeners.get("data")).toHaveLength(0);
    stream.close();
    expect(socket.gone).toBe(1);
  });

  it("receive reaches parse", () => {
    const { socket, stream } = setup();
    stream.receive("payload");
    expect(socket.parsed).toEqual(["payload"]);
  });
});
