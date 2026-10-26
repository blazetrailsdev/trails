import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { socketPair } from "../test-helpers/socket-pair.js";
import { ClientSocket } from "./client-socket.js";
import { StreamEventLoop } from "./stream-event-loop.js";
import { WebSocket } from "./web-socket.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

class Target {
  events: unknown[][] = [];
  onOpen() {
    this.events.push(["open"]);
  }
  onMessage(data: unknown) {
    this.events.push(["message", data]);
  }
  onError(message: string) {
    this.events.push(["error", message]);
  }
  onClose(reason: string, code: number) {
    this.events.push(["close", reason, code]);
  }
}

function frame(opcode: number, payload: Uint8Array): Uint8Array {
  return Uint8Array.from([0x80 | opcode, 0x80 | payload.length, 0, 0, 0, 0, ...payload]);
}

function env(): Record<string, unknown> {
  return {
    REQUEST_METHOD: "GET",
    REQUEST_URI: "/test",
    HTTP_HOST: "localhost",
    HTTP_CONNECTION: "upgrade",
    HTTP_UPGRADE: "websocket",
    HTTP_SEC_WEBSOCKET_KEY: "dGhlIHNhbXBsZSBub25jZQ==",
    HTTP_SEC_WEBSOCKET_VERSION: "13",
    HTTP_SEC_WEBSOCKET_PROTOCOL: "actioncable-v1-json",
  };
}

function open() {
  const [io, peer] = socketPair();
  const target = new Target();
  const e = { ...env(), "rack.hijack": () => io };
  const socket = new ClientSocket(e, target, new StreamEventLoop(), ["actioncable-v1-json"]);
  expect(socket.rackResponse()).toEqual([-1, {}, []]);
  return { io, peer, target, socket };
}

const text = (bytes: unknown) => new TextDecoder().decode(bytes as Uint8Array);

describe("ClientSocket", () => {
  it("determines the url from the Rack env", () => {
    expect(ClientSocket.determineUrl(env())).toBe("ws://localhost/test");
    expect(ClientSocket.determineUrl({ ...env(), HTTP_X_FORWARDED_PROTO: "https" })).toBe(
      "wss://localhost/test",
    );
  });

  it("drives a session over the hijacked socket", async () => {
    const { peer, target, socket } = open();
    await tick();
    const handshake = text(peer.read());
    expect(handshake).toMatch(/^HTTP\/1\.1 101 Switching Protocols\r\n/);
    expect(handshake).toContain("Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    expect(socket.protocol).toBe("actioncable-v1-json");
    expect(target.events).toEqual([["open"]]);
    expect(socket.isAlive()).toBe(true);

    peer.write(frame(1, new TextEncoder().encode("hi")));
    await tick();
    expect(target.events.at(-1)).toEqual(["message", "hi"]);

    expect(socket.transmit(42)).toBe(true);
    await tick();
    expect([...(peer.read() as Uint8Array)]).toEqual([0x81, 2, 0x34, 0x32]);
    expect(socket.transmit({})).toBe(false);

    peer.write(frame(8, Uint8Array.from([0x0f, 0xa0, ...new TextEncoder().encode("bye")])));
    await tick();
    expect(target.events.at(-1)).toEqual(["close", "bye", 4000]);
    socket.clientGone();
    expect(target.events.filter((e) => e[0] === "close")).toHaveLength(1);
    expect(socket.transmit("late")).toBe(false);
  });

  it("raises for an out-of-range close code", () => {
    const { socket } = open();
    expect(() => socket.close(2000)).toThrow(ArgumentError);
    expect(() => socket.close(2000)).toThrow(
      "Failed to execute 'close' on WebSocket: The code must be either 1000, or between 3000 and 4999. 2000 is neither.",
    );
  });

  it("closes with 1006 when the client vanishes", () => {
    const { target, socket } = open();
    socket.clientGone();
    expect(target.events.at(-1)).toEqual(["close", "", 1006]);
  });

  it("delegates write errors to on_error", () => {
    const { io, target, socket } = open();
    io.write = () => {
      throw new Error("foo");
    };
    socket.write("boo");
    expect(target.events.at(-1)).toEqual(["error", "foo"]);
  });
});

describe("WebSocket", () => {
  it("builds a client socket only for a websocket request", () => {
    const target = new Target();
    const loop = new StreamEventLoop();
    const ws = new WebSocket(env(), target, loop);
    expect(ws.isPossible()).toBeInstanceOf(ClientSocket);
    expect(ws.isAlive()).toBe(false);

    const plain = new WebSocket({ ...env(), HTTP_UPGRADE: undefined }, target, loop);
    expect(plain.isPossible()).toBeNull();
    expect(plain.isAlive()).toBeUndefined();
    expect(plain.transmit("x")).toBeUndefined();
    expect(plain.rackResponse()).toBeUndefined();
  });
});
