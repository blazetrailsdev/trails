import { describe, expect, it } from "vitest";
import { socketPair } from "../test-helpers/socket-pair.js";
import { StreamEventLoop } from "./stream-event-loop.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function stream(closeRaises = false, shutdown: () => void = () => {}) {
  return {
    received: [] as unknown[],
    closes: 0,
    receive(data: unknown) {
      this.received.push(data);
    },
    close() {
      this.closes++;
      shutdown();
      if (closeRaises) throw new Error("boom");
    },
  };
}

describe("ActionCable::Connection::StreamEventLoop", () => {
  it("hands incoming bytes to the stream and closes it on EOF", async () => {
    const loop = new StreamEventLoop();
    const [io, peer] = socketPair();
    const s = stream(false, () => loop.detach(io, s));
    loop.attach(io, s);
    peer.write("hello");
    await tick();
    expect(s.received).toEqual([new TextEncoder().encode("hello")]);
    peer.closeWrite();
    await tick();
    expect(s.closes).toBe(1);
  });

  it("closes the stream when receive raises, and deregisters when that close raises too", async () => {
    const loop = new StreamEventLoop();
    const [io, peer] = socketPair();
    const s = stream(true);
    s.receive = () => {
      throw new Error("bad frame");
    };
    loop.attach(io, s);
    peer.write("x");
    await tick();
    expect(s.closes).toBe(1);
    peer.write("y");
    await tick();
    expect(s.closes).toBe(1);
  });

  it("detach stops reading and closes the io", async () => {
    const loop = new StreamEventLoop();
    const [io, peer] = socketPair();
    const s = stream();
    loop.attach(io, s);
    loop.detach(io, s);
    expect(io.isClosed()).toBe(true);
    peer.write("late");
    await tick();
    expect(s.received).toEqual([]);
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
