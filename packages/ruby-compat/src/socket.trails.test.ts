import { describe, expect, it } from "vitest";
import type { HttpSocket } from "./http-adapter.js";
import { EOFError } from "./eof-error.js";
import { Errno } from "./errno.js";
import { IO } from "./io.js";
import { IOError } from "./io-error.js";
import { TCPSocket } from "./socket.js";

function fakeSocket() {
  const listeners: Record<string, ((arg?: unknown) => void)[]> = {};
  const calls: string[] = [];
  let accepting = true;
  const socket = {
    write: () => (calls.push("write"), accepting),
    end: () => calls.push("end"),
    destroy: () => calls.push("destroy"),
    unshift: () => null,
    pause: () => calls.push("pause"),
    resume: () => calls.push("resume"),
    on: (event: string, fn: (arg?: unknown) => void) => (listeners[event] ??= []).push(fn),
    removeListener: () => null,
  };
  const emit = (event: string, arg?: unknown) => listeners[event]?.forEach((fn) => fn(arg));
  const backUp = (full: boolean) => void (accepting = !full);
  return { socket: socket as unknown as HttpSocket, calls, emit, backUp };
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

  it("waits for length bytes across two data events", async () => {
    const { socket, emit } = fakeSocket();
    const io = new TCPSocket(socket);
    const read = io.readBlocking(4);
    emit("data", new Uint8Array([1, 2]));
    emit("data", new Uint8Array([3, 4, 5]));
    expect(await read).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("answers a short read at end of file", async () => {
    const { socket, emit } = fakeSocket();
    const io = new TCPSocket(socket);
    const read = io.readBlocking(4);
    emit("data", new Uint8Array([1, 2]));
    emit("end");
    expect(await read).toEqual(new Uint8Array([1, 2]));
    expect(await io.readBlocking(1)).toBeNull();
  });

  it("raises IOError on a closed stream and closes once both sides are shut", () => {
    const { socket, calls } = fakeSocket();
    const io = new TCPSocket(socket);
    io.closeWrite();
    expect(() => io.write("x")).toThrow(IOError);
    io.closeRead();
    expect(io.isClosed()).toBe(true);
    expect(calls).toEqual(["resume", "end", "destroy"]);
    expect(() => io.read()).toThrow(IOError);
  });

  it("read_nonblock answers wait_readable, then bytes, then nil at end of file", () => {
    const { socket, emit } = fakeSocket();
    const io = new TCPSocket(socket);
    expect(io.readNonblock(4096, null, { exception: false })).toBe("wait_readable");
    expect(() => io.readNonblock(4096)).toThrow(IO.EAGAINWaitReadable);
    expect(() => io.readNonblock(4096)).toThrow(Errno.EAGAIN);
    expect(() => io.readNonblock(4096)).toThrow(
      "Resource temporarily unavailable - read would block",
    );
    emit("data", new Uint8Array([1, 2, 3]));
    expect(io.readNonblock(2, null, { exception: false })).toEqual(new Uint8Array([1, 2]));
    expect(io.readNonblock(4096, null, { exception: false })).toEqual(new Uint8Array([3]));
    emit("end");
    expect(io.readNonblock(4096, null, { exception: false })).toBeNull();
    expect(() => io.readNonblock(4096)).toThrow(EOFError);
  });

  it("fills the outbuf with what was read and clears it at end of file", () => {
    const { socket, emit } = fakeSocket();
    const io = new TCPSocket(socket);
    const buf = new Uint8Array([9, 9, 9]);
    emit("data", new Uint8Array([1, 2]));
    expect(io.read(2, buf)).toEqual(new Uint8Array([1, 2]));
    expect(buf).toEqual(new Uint8Array([1, 2, 9]));
    emit("end");
    expect(io.read(2, buf)).toBeNull();
    expect(buf).toEqual(new Uint8Array([0, 0, 0]));
  });

  it("pauses the socket above the high-water mark and resumes once drained", () => {
    const { socket, calls, emit } = fakeSocket();
    const io = new TCPSocket(socket);
    emit("data", new Uint8Array(64 * 1024));
    expect(calls).toEqual(["resume"]);
    emit("data", new Uint8Array(1));
    expect(calls).toEqual(["resume", "pause"]);
    io.readNonblock(1);
    expect(calls).toEqual(["resume", "pause", "resume"]);
  });

  it("writes without blocking until a write backs the socket up", () => {
    const { socket, calls, backUp } = fakeSocket();
    const io = new TCPSocket(socket);
    expect(io.writeNonblock("hi")).toBe(2);
    backUp(true);
    expect(io.writeNonblock(new Uint8Array([1, 2, 3]))).toBe(3);
    expect(io.writeNonblock("x", { exception: false })).toBe("wait_writable");
    expect(() => io.writeNonblock("x")).toThrow(IO.EAGAINWaitWritable);
    expect(() => io.writeNonblock("x")).toThrow(Errno.EAGAIN);
    expect(() => io.writeNonblock("x")).toThrow("write would block");
    expect(calls.filter((call) => call === "write")).toHaveLength(2);
  });

  it("waits to be writable until the socket drains", async () => {
    const { socket, emit, backUp } = fakeSocket();
    const io = new TCPSocket(socket);
    await expect(io.waitWritable()).resolves.toBe(io);
    backUp(true);
    io.write("x");
    let woke = false;
    const waiting = io.waitWritable().then(() => (woke = true));
    await Promise.resolve();
    expect(woke).toBe(false);
    backUp(false);
    emit("drain");
    await waiting;
    expect(io.writeNonblock("y")).toBe(1);
  });

  it("stops waiting to be writable when the peer goes", async () => {
    const { socket, emit, backUp } = fakeSocket();
    const io = new TCPSocket(socket);
    backUp(true);
    io.write("x");
    const waiting = io.waitWritable();
    emit("close");
    await expect(waiting).resolves.toBe(io);
  });

  it("refuses a nonblocking write once the write side is closed", () => {
    const { socket } = fakeSocket();
    const io = new TCPSocket(socket);
    io.closeWrite();
    expect(() => io.writeNonblock("x")).toThrow(IOError);
  });
});
