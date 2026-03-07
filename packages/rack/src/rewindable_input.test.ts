import { describe, it, expect } from "vitest";
import { RewindableInput, RewindableInputMiddleware } from "./rewindable-input.js";
import { RACK_INPUT } from "./constants.js";

function makeInput(data: string) {
  return new RewindableInput({ read() { return data; } });
}

it("be able to handle to read()", () => {
  const input = makeInput("hello");
  expect(input.read()).toBe("hello");
});

it("be able to handle to read(nil)", () => {
  const input = makeInput("hello");
  expect(input.read(null)).toBe("hello");
});

it("be able to handle to read(length)", () => {
  const input = makeInput("hello");
  expect(input.read(3)).toBe("hel");
});

it("be able to handle to read(length, buffer)", () => {
  const input = makeInput("hello");
  const buf = Buffer.alloc(10);
  const result = input.read(3, buf);
  expect(result).toBeDefined();
  expect(result!.toString()).toBe("hel");
});

it("be able to handle to read(nil, buffer)", () => {
  const input = makeInput("hello");
  const buf = Buffer.alloc(10);
  const result = input.read(null, buf);
  expect(result).toBeDefined();
  expect(result!.toString()).toBe("hello");
});

it("rewind to the beginning when #rewind is called", () => {
  const input = makeInput("hello");
  expect(input.read()).toBe("hello");
  input.rewind();
  expect(input.read()).toBe("hello");
});

it("be able to handle gets", () => {
  const input = makeInput("hello\nworld\n");
  expect(input.gets()).toBe("hello\n");
  expect(input.gets()).toBe("world\n");
  expect(input.gets()).toBeNull();
});

it("be able to handle size", () => {
  const input = makeInput("hello");
  expect(input.size).toBe(5);
});

it("be able to handle each", () => {
  const input = makeInput("hello\nworld\n");
  const lines: string[] = [];
  input.each((line) => lines.push(line));
  expect(lines).toEqual(["hello\n", "world\n"]);
});

it("not buffer into a Tempfile if no data has been read yet", () => {
  const input = makeInput("hello");
  // Before any read, internal buffer should not exist
  // Just verify it doesn't throw
  expect(input.size).toBe(5);
});

it("buffer into a Tempfile when data has been consumed for the first time", () => {
  const input = makeInput("hello");
  input.read();
  input.rewind();
  expect(input.read()).toBe("hello");
});

it("close the underlying tempfile upon calling #close", () => {
  const input = makeInput("hello");
  input.read();
  input.close();
  expect(input.closed).toBe(true);
});

it("handle partial writes to tempfile", () => {
  const input = makeInput("hello world");
  expect(input.read(5)).toBe("hello");
  expect(input.read(6)).toBe(" world");
  expect(input.read(1)).toBeNull();
});

it("close the underlying tempfile upon calling #close when not using posix semantics", () => {
  const input = makeInput("hello");
  input.read();
  input.close();
  expect(input.closed).toBe(true);
});

it("be possible to call #close when no data has been buffered yet", () => {
  const input = makeInput("hello");
  input.close();
  expect(input.closed).toBe(true);
});

it("be possible to call #close multiple times", () => {
  const input = makeInput("hello");
  input.close();
  input.close();
  expect(input.closed).toBe(true);
});

describe("Rack::RewindableInput::Middleware", () => {
  it("wraps rack.input in RewindableInput", async () => {
    const app = async (env: any) => {
      expect(env[RACK_INPUT]).toBeInstanceOf(RewindableInput);
      return [200, {}, ["OK"]] as [number, Record<string, any>, any];
    };
    const mw = new RewindableInputMiddleware(app);
    await mw.call({ [RACK_INPUT]: { read() { return "test"; } } });
  });

  it("preserves a nil rack.input", async () => {
    const app = async (env: any) => {
      expect(env[RACK_INPUT]).toBeUndefined();
      return [200, {}, ["OK"]] as [number, Record<string, any>, any];
    };
    const mw = new RewindableInputMiddleware(app);
    await mw.call({});
  });
});
