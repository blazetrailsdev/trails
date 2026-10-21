import { afterEach, beforeEach, it, expect } from "vitest";
import { StringIO, b, rbObjIvarGet } from "@blazetrails/ruby-compat";
import { RewindableInput } from "./rewindable-input.js";
import { RACK_INPUT } from "./constants.js";

let io: StringIO;
let rio: RewindableInput | null;

beforeEach(() => {
  io = new StringIO("hello world");
  rio = new RewindableInput(io);
});

afterEach(() => {
  rio?.close();
  rio = null;
});

function rewindableIo(): any {
  return rbObjIvarGet(rio!, "@rewindable_io");
}

it("be able to handle to read()", () => {
  expect(rio!.read()).toEqual(b("hello world"));
});

it("be able to handle to read(nil)", () => {
  expect(rio!.read(null)).toEqual(b("hello world"));
});

it("be able to handle to read(length)", () => {
  expect(rio!.read(1)).toEqual(b("h"));
});

it("be able to handle to read(length, buffer)", () => {
  const buffer = new Uint8Array(1);
  const result = rio!.read(1, buffer);
  expect(result).toEqual(b("h"));
  expect(buffer[0]).toBe("h".charCodeAt(0));
});

it("be able to handle to read(nil, buffer)", () => {
  const buffer = new Uint8Array(11);
  const result = rio!.read(null, buffer);
  expect(result).toEqual(b("hello world"));
  expect(new TextDecoder().decode(buffer)).toBe("hello world");
});

it("rewind to the beginning when #rewind is called", () => {
  rio!.rewind();
  expect(rio!.read(1)).toEqual(b("h"));
  rio!.rewind();
  expect(rio!.read()).toEqual(b("hello world"));
});

it("be able to handle gets", () => {
  expect(rio!.gets()).toEqual(b("hello world"));
  rio!.rewind();
  expect(rio!.gets()).toEqual(b("hello world"));
});

it("be able to handle size", () => {
  expect(rio!.size()).toBe("hello world".length);
  expect(rio!.size()).toBe("hello world".length);
  rio!.rewind();
  expect(rio!.gets()).toEqual(b("hello world"));
});

it("be able to handle each", () => {
  let array: (string | Uint8Array)[] = [];
  rio!.each((data) => {
    array.push(data);
  });
  expect(array).toEqual([b("hello world")]);

  rio!.rewind();
  array = [];
  rio!.each((data) => {
    array.push(data);
  });
  expect(array).toEqual([b("hello world")]);
});

it("not buffer into a Tempfile if no data has been read yet", () => {
  expect(rewindableIo()).toBeNull();
});

it("buffer into a Tempfile when data has been consumed for the first time", () => {
  rio!.read(1);
  const tempfile = rewindableIo();
  expect(tempfile).not.toBeNull();
  rio!.read(1);
  const tempfile2 = rewindableIo();
  expect(tempfile2.path()).toBe(tempfile.path());
});

it("close the underlying tempfile upon calling #close", () => {
  rio!.read(1);
  const tempfile = rewindableIo();
  rio!.close();
  expect(tempfile.isClosed()).toBeTruthy();
});

it("handle partial writes to tempfile", () => {
  const r = rio as any;
  const original = r.isFilesystemHasPosixSemantics;
  r.isFilesystemHasPosixSemantics = function (this: any) {
    const tempfile = this.rewindableIo;
    const write = tempfile.write.bind(tempfile);
    tempfile.write = (buffer: Uint8Array) => write(buffer.subarray(0, 2));
    return original.call(this);
  };
  rio!.read(1);
  const tempfile = rewindableIo();
  rio!.close();
  expect(tempfile.isClosed()).toBeTruthy();
});

it("close the underlying tempfile upon calling #close when not using posix semantics", () => {
  (rio as any).isFilesystemHasPosixSemantics = () => false;
  rio!.read(1);
  const tempfile = rewindableIo();
  rio!.close();
  expect(tempfile.isClosed()).toBeTruthy();
});

it("be possible to call #close when no data has been buffered yet", () => {
  expect(rio!.close()).toBeNull();
});

it("be possible to call #close multiple times", () => {
  expect(rio!.close()).toBeNull();
  expect(rio!.close()).toBeNull();
});

it("wraps rack.input in RewindableInput", async () => {
  let app: any = { call: (env: any) => [200, {}, [env[RACK_INPUT].constructor.name]] };
  expect(app.call({ [RACK_INPUT]: new StringIO("") })[2]).toEqual(["StringIO"]);
  app = new RewindableInput.Middleware(app);
  expect((await app.call({ [RACK_INPUT]: new StringIO("") }))[2]).toEqual(["RewindableInput"]);
});
