import { describe, expect, it, vi } from "vitest";

import { Buffer, ClientDisconnected, Response, SSE } from "./live.js";

function makeResponse() {
  return new Response();
}

describe("ActionController::Live::Buffer", () => {
  it("queueSize defaults to 10", () => {
    expect(Buffer.queueSize).toBe(10);
  });

  it("write pushes chunks and sets Cache-Control/Content-Length on uncommitted response", () => {
    const res = makeResponse();
    res.setHeader("content-length", "42");
    const buf = new Buffer(res);
    buf.write("hello");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["content-length"]).toBeUndefined();
  });

  it("write does not touch headers once response is committed", () => {
    const res = makeResponse();
    res.close();
    const buf = new Buffer(res);
    buf.write("x");
    expect(res.headers["cache-control"]).toBeUndefined();
  });

  it("writeln appends a newline only when missing", () => {
    const buf = new Buffer(makeResponse());
    buf.writeln("a");
    buf.writeln("b\n");
    expect([...buf.eachChunk()]).toEqual(["a\n", "b\n"]);
  });

  it("close pushes a null sentinel; eachChunk stops there", () => {
    const buf = new Buffer(makeResponse());
    buf.write("one");
    buf.write("two");
    buf.close();
    expect([...buf.eachChunk()]).toEqual(["one", "two"]);
    expect(buf.closed).toBe(true);
  });

  it("write after close raises (matches Rails IOError-on-closed-stream)", () => {
    const buf = new Buffer(makeResponse());
    buf.close();
    expect(() => buf.write("x")).toThrow(/closed stream/);
  });

  it("close commits the underlying response", () => {
    const res = makeResponse();
    const buf = new Buffer(res);
    buf.close();
    expect(res.committed).toBe(true);
  });

  it("abort clears the queue, isConnected flips to false", () => {
    const buf = new Buffer(makeResponse());
    buf.write("a");
    buf.abort();
    expect(buf.isConnected).toBe(false);
    expect([...buf.eachChunk()]).toEqual([]);
  });

  it("write after abort raises ClientDisconnected by default", () => {
    const buf = new Buffer(makeResponse());
    buf.abort();
    expect(() => buf.write("x")).toThrow(ClientDisconnected);
  });

  it("ignoreDisconnect=true silently swallows writes after abort", () => {
    const buf = new Buffer(makeResponse());
    buf.ignoreDisconnect = true;
    buf.abort();
    expect(() => buf.write("x")).not.toThrow();
  });

  it("onError + callOnError fires the registered callback", () => {
    const buf = new Buffer(makeResponse());
    const cb = vi.fn();
    buf.onError(cb);
    buf.callOnError();
    expect(cb).toHaveBeenCalledOnce();
  });

  it("default error callback is a no-op", () => {
    const buf = new Buffer(makeResponse());
    expect(() => buf.callOnError()).not.toThrow();
  });
});

describe("ActionController::Live::SSE", () => {
  function captureStream() {
    const writes: string[] = [];
    let closed = false;
    return {
      stream: {
        write: (s: string) => writes.push(s),
        close: () => {
          closed = true;
        },
      },
      writes,
      isClosed: () => closed,
    };
  }

  it("writes a string payload with data: prefix", () => {
    const cap = captureStream();
    new SSE(cap.stream).write("hello");
    expect(cap.writes.join("")).toBe("data: hello\n\n");
  });

  it("encodes objects as JSON", () => {
    const cap = captureStream();
    new SSE(cap.stream).write({ name: "John" });
    expect(cap.writes.join("")).toBe(`data: ${JSON.stringify({ name: "John" })}\n\n`);
  });

  it("emits permitted options (event, id, retry) per write", () => {
    const cap = captureStream();
    new SSE(cap.stream).write("hi", { event: "x", id: "1", retry: 500 });
    const joined = cap.writes.join("");
    expect(joined).toContain("event: x\n");
    expect(joined).toContain("id: 1\n");
    expect(joined).toContain("retry: 500\n");
    expect(joined.endsWith("data: hi\n\n")).toBe(true);
  });

  it("constructor options apply to every write unless overridden", () => {
    const cap = captureStream();
    const sse = new SSE(cap.stream, { event: "default", retry: 100 });
    sse.write("a");
    sse.write("b", { event: "override" });
    const joined = cap.writes.join("");
    expect(joined).toContain("event: default\n");
    expect(joined).toContain("event: override\n");
  });

  it("emits an empty id: line when id is the empty string (Last-Event-ID reset)", () => {
    const cap = captureStream();
    new SSE(cap.stream).write("hi", { id: "" });
    expect(cap.writes.join("")).toContain("id: \n");
  });

  it("splits embedded newlines into multiple data: lines", () => {
    const cap = captureStream();
    new SSE(cap.stream).write("line1\nline2");
    expect(cap.writes.join("")).toBe("data: line1\ndata: line2\n\n");
  });

  it("close closes the underlying stream", () => {
    const cap = captureStream();
    new SSE(cap.stream).close();
    expect(cap.isClosed()).toBe(true);
  });
});

describe("ActionController::Live::Response", () => {
  it("constructs a Buffer as its stream", () => {
    const res = new Response();
    expect(res.stream).toBeInstanceOf(Buffer);
  });

  it("stream writes flow through the live Buffer", () => {
    const res = new Response();
    res.stream.write("a");
    res.stream.write("b");
    res.stream.close();
    expect([...res.stream.eachChunk()]).toEqual(["a", "b"]);
  });

  it("inherits DispatchResponse.create factory shape (status/headers/body args)", () => {
    const res = new Response(201, { "x-test": "1" }, ["seed"]);
    expect(res.status).toBe(201);
    expect(res.headers["x-test"]).toBe("1");
    expect(res.body).toBe("seed");
    expect(res.stream).toBeInstanceOf(Buffer);
  });

  it("beforeCommitted (via close) flushes accumulated cookies into a set-cookie header", () => {
    const res = new Response();
    res.setCookie("session", "abc");
    res.setCookie("flash", "hi");
    res.stream.close();
    expect(res.headers["set-cookie"]).toBe("session=abc\nflash=hi");
    expect(res.committed).toBe(true);
  });

  it("beforeCommitted does not overwrite an explicit set-cookie header", () => {
    const res = new Response();
    res.setCookie("session", "abc");
    res.setHeader("set-cookie", "manual=1");
    res.stream.close();
    expect(res.headers["set-cookie"]).toBe("manual=1");
  });
});
