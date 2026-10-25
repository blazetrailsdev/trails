import { describe, expect, it } from "vitest";
import { EOFError, Errno } from "@blazetrails/ruby-compat";
import { socketPair } from "../test-helpers/socket-pair.js";
import { Stream } from "./stream.js";
import { StreamEventLoop } from "./stream-event-loop.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(env: Record<string, unknown> = {}) {
  const [io, peer] = socketPair();
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
  return { io, peer, socket, stream };
}

describe("ActionCable::Connection::Stream", () => {
  it("hijacks the rack socket and attaches it to the event loop", async () => {
    const { peer, socket, stream } = setup();
    stream.hijackRackSocket();
    peer.write("frame");
    await tick();
    expect(socket.parsed).toEqual([new TextEncoder().encode("frame")]);
  });

  it("falls back to rack.hijack_io and skips with no rack.hijack", async () => {
    const [io, peer] = socketPair();
    const { socket, stream } = setup({ "rack.hijack": () => null, "rack.hijack_io": io });
    stream.hijackRackSocket();
    peer.write("frame");
    await tick();
    expect(socket.parsed).toHaveLength(1);
    const bare = setup({ "rack.hijack": null });
    expect(bare.stream.hijackRackSocket()).toBeUndefined();
  });

  it("writes to the io and returns the byte size", async () => {
    const { io, peer, stream } = setup();
    stream.hijackRackSocket();
    expect(stream.write("héllo")).toBe(6);
    expect(stream.write(new Uint8Array([1, 2, 3]))).toBe(3);
    await tick();
    expect(io.isClosed()).toBe(false);
    expect(peer.read()).toEqual(new Uint8Array([...new TextEncoder().encode("héllo"), 1, 2, 3]));
  });

  it("calls client_gone on EOFError or ECONNRESET and raises anything else", () => {
    const { io, socket, stream } = setup();
    stream.hijackRackSocket();
    let raise: Error = new EOFError("end of file reached");
    io.write = () => {
      throw raise;
    };
    stream.write("x");
    raise = Object.assign(new Error("reset"), { code: "ECONNRESET" });
    stream.write("x");
    raise = new Errno.ECONNRESET();
    stream.write("x");
    expect(socket.gone).toBe(3);
    raise = new Error("boom");
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
    expect(io.isClosed()).toBe(true);
    stream.close();
    expect(socket.gone).toBe(1);
  });

  it("receive reaches parse", () => {
    const { socket, stream } = setup();
    stream.receive("payload");
    expect(socket.parsed).toEqual(["payload"]);
  });
});
