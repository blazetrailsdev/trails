import { describe, expect, it } from "vitest";
import type { HttpSocket } from "./http-adapter.js";
import { IOError } from "./io-error.js";
import { TCPSocket } from "./socket.js";

function fakeSocket() {
  const listeners: Record<string, ((arg?: unknown) => void)[]> = {};
  const calls: string[] = [];
  const socket = {
    write: () => calls.push("write"),
    end: () => calls.push("end"),
    destroy: () => calls.push("destroy"),
    unshift: () => null,
    on: (event: string, fn: (arg?: unknown) => void) => (listeners[event] ??= []).push(fn),
    removeListener: () => null,
  };
  const emit = (event: string, arg?: unknown) => listeners[event]?.forEach((fn) => fn(arg));
  return { socket: socket as unknown as HttpSocket, calls, emit };
}

describe("TCPSocket", () => {
  it("reads what has arrived and nil at end of file", () => {
    const { socket, emit } = fakeSocket();
    const io = new TCPSocket(socket);
    emit("data", new Uint8Array([104, 105, 33]));
    expect(io.read(2)).toEqual(new Uint8Array([104, 105]));
    expect(io.read()).toEqual(new Uint8Array([33]));
    emit("end");
    expect(io.read(1)).toBeNull();
  });

  it("raises IOError on a closed stream and closes once both sides are shut", () => {
    const { socket, calls } = fakeSocket();
    const io = new TCPSocket(socket);
    io.closeWrite();
    expect(() => io.write("x")).toThrow(IOError);
    io.closeRead();
    expect(io.isClosed()).toBe(true);
    expect(calls).toEqual(["end", "destroy"]);
    expect(() => io.read()).toThrow(IOError);
  });
});
