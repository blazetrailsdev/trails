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
  const written: Uint8Array[] = [];
  const socket = {
    writableLength: 0,
    writableHighWaterMark: 8,
    write: (chunk: Uint8Array) => {
      calls.push("write");
      written.push(chunk);
      socket.writableLength += chunk.length;
      return socket.writableLength < socket.writableHighWaterMark;
    },
    end: () => calls.push("end"),
    destroy: () => calls.push("destroy"),
    unshift: () => null,
    pause: () => calls.push("pause"),
    resume: () => calls.push("resume"),
    on: (event: string, fn: (arg?: unknown) => void) => (listeners[event] ??= []).push(fn),
    removeListener: () => null,
  };
  const emit = (event: string, arg?: unknown) => listeners[event]?.forEach((fn) => fn(arg));
  const drain = () => {
    socket.writableLength = 0;
    emit("drain");
  };
  return { socket: socket as unknown as HttpSocket, calls, emit, written, drain };
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

  it("writes as much as fits without blocking and answers the count", () => {
    const { socket, written } = fakeSocket();
    const io = new TCPSocket(socket);
    expect(io.writeNonblock("hello")).toBe(5);
    expect(io.writeNonblock(new Uint8Array([1, 2, 3, 4, 5]))).toBe(3);
    expect(written[1]).toEqual(new Uint8Array([1, 2, 3]));
    expect(io.writeNonblock("x", { exception: false })).toBe("wait_writable");
    expect(() => io.writeNonblock("x")).toThrow(IO.EAGAINWaitWritable);
    expect(() => io.writeNonblock("x")).toThrow(Errno.EAGAIN);
    expect(() => io.writeNonblock("x")).toThrow("write would block");
    expect(
      (() => {
        try {
          io.writeNonblock("x");
        } catch (error) {
          return error;
        }
      })(),
    ).toBeInstanceOf(IO.WaitWritable as unknown as typeof Error);
    expect(IO.EWOULDBLOCKWaitWritable).toBe(IO.EAGAINWaitWritable);
    expect(written).toHaveLength(2);
  });

  it("waits to be writable until the socket drains", async () => {
    const { socket, drain } = fakeSocket();
    const io = new TCPSocket(socket);
    await expect(io.waitWritable()).resolves.toBe(io);
    io.write("12345678");
    let woke = false;
    const waiting = io.waitWritable().then(() => (woke = true));
    await Promise.resolve();
    expect(woke).toBe(false);
    drain();
    await waiting;
    expect(io.writeNonblock("y")).toBe(1);
  });

  it("raises the host's error on a nonblocking write once the peer has gone", async () => {
    const { socket, emit } = fakeSocket();
    const io = new TCPSocket(socket);
    io.write("12345678");
    const waiting = io.waitWritable();
    emit("error", Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }));
    emit("close");
    await expect(waiting).resolves.toBe(io);
    expect(() => io.writeNonblock("x", { exception: false })).toThrow(Errno.ECONNRESET);
  });

  it("raises EPIPE on a nonblocking write once the peer has closed", () => {
    const { socket, emit } = fakeSocket();
    const io = new TCPSocket(socket);
    emit("close");
    expect(() => io.writeNonblock("x", { exception: false })).toThrow(Errno.EPIPE);
  });

  it("answers nil when the wait to be writable times out", async () => {
    const { socket } = fakeSocket();
    const io = new TCPSocket(socket);
    io.write("12345678");
    await expect(io.waitWritable(0.01)).resolves.toBeNull();
    expect(io.writeNonblock("y", { exception: false })).toBe("wait_writable");
  });

  it("refuses a negative timeout to wait to be writable", async () => {
    const { socket } = fakeSocket();
    const io = new TCPSocket(socket);
    await expect(io.waitWritable(-1)).rejects.toThrow("time interval must not be negative");
  });

  it("raises when the socket is closed while waiting to be writable", async () => {
    const { socket, emit } = fakeSocket();
    const io = new TCPSocket(socket);
    io.write("12345678");
    const waiting = io.waitWritable();
    io.close();
    emit("close");
    await expect(waiting).rejects.toThrow(IOError);
  });

  it("refuses a nonblocking write once the write side is closed", async () => {
    const { socket } = fakeSocket();
    const io = new TCPSocket(socket);
    io.closeWrite();
    expect(() => io.writeNonblock("x")).toThrow(IOError);
    await expect(io.waitWritable()).rejects.toThrow(IOError);
  });

  it("answers 0 for an empty nonblocking write even with no room", () => {
    const { socket, written } = fakeSocket();
    const io = new TCPSocket(socket);
    io.write("12345678");
    expect(io.writeNonblock("")).toBe(0);
    expect(io.writeNonblock(new Uint8Array(0), { exception: false })).toBe(0);
    expect(written).toHaveLength(1);
  });

  it("refuses a non-boolean exception to a nonblocking write", () => {
    const { socket, written } = fakeSocket();
    const io = new TCPSocket(socket);
    expect(() => io.writeNonblock("x", { exception: 0 as unknown as boolean })).toThrow(
      "expected true or false as exception: 0",
    );
    expect(written).toHaveLength(0);
  });

  it("writes the to_s of a buf that is not a String", () => {
    const { socket, written } = fakeSocket();
    const io = new TCPSocket(socket);
    expect(io.writeNonblock(42)).toBe(2);
    expect(written[0]).toEqual(new TextEncoder().encode("42"));
  });
});
