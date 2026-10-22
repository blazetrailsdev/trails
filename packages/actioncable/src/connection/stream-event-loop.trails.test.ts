import { describe, expect, it } from "vitest";
import { StreamEventLoop } from "./stream-event-loop.js";

type Listener = (...args: unknown[]) => void;

class FakeIo {
  listeners = new Map<string, Listener[]>();
  destroyed = false;
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
  count(): number {
    return [...this.listeners.values()].reduce((n, ls) => n + ls.length, 0);
  }
  destroy(): void {
    this.destroyed = true;
  }
}

function stream(closeRaises = false) {
  return {
    received: [] as unknown[],
    closes: 0,
    receive(data: unknown) {
      this.received.push(data);
    },
    close() {
      this.closes++;
      if (closeRaises) throw new Error("boom");
    },
  };
}

describe("ActionCable::Connection::StreamEventLoop", () => {
  it("hands incoming bytes to the stream and closes it on EOF and on error", () => {
    const loop = new StreamEventLoop();
    const io = new FakeIo();
    const s = stream();
    loop.attach(io, s);
    io.emit("data", "hello");
    expect(s.received).toEqual(["hello"]);
    io.emit("end");
    io.emit("error", new Error("reset"));
    expect(s.closes).toBe(2);
  });

  it("deregisters the io when closing the stream raises", () => {
    const loop = new StreamEventLoop();
    const io = new FakeIo();
    loop.attach(io, stream(true));
    io.emit("error", new Error("reset"));
    expect(io.count()).toBe(0);
  });

  it("closes the stream when receive raises, and deregisters when that close raises too", () => {
    const loop = new StreamEventLoop();
    const io = new FakeIo();
    const s = stream(true);
    s.receive = () => {
      throw new Error("bad frame");
    };
    loop.attach(io, s);
    expect(() => io.emit("data", "x")).not.toThrow();
    expect(s.closes).toBe(1);
    expect(io.count()).toBe(0);
  });

  it("detach removes the listeners and closes the io", () => {
    const loop = new StreamEventLoop();
    const io = new FakeIo();
    const s = stream();
    loop.attach(io, s);
    loop.detach(io, s);
    expect(io.count()).toBe(0);
    expect(io.destroyed).toBe(true);
  });

  it("post runs a task, positional or block, on the executor", async () => {
    const loop = new StreamEventLoop();
    const ran: string[] = [];
    await new Promise<void>((resolve) => {
      loop.post(() => ran.push("task"));
      loop.post(null, () => {
        ran.push("block");
        resolve();
      });
    });
    expect(ran).toEqual(["task", "block"]);
  });

  it("timer returns a task that can be shut down", () => {
    const timer = new StreamEventLoop().timer(1, () => null);
    expect(timer.shutdown()).toBe(true);
  });
});
