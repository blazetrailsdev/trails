import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Errno, StringIO } from "@blazetrails/ruby-compat";
import { RewindableInput, RewindableInputMiddleware } from "./rewindable-input.js";

function rewindableTest(makeIo: () => any) {
  let rio: any;

  beforeEach(() => {
    rio = new RewindableInput(makeIo());
  });

  afterEach(() => {
    rio.close();
    rio = null;
  });

  it("be able to handle to read()", () => {
    expect(rio.read()).toBe("hello world");
  });

  it("be able to handle to read(nil)", () => {
    expect(rio.read(null)).toBe("hello world");
  });

  it("be able to handle to read(length)", () => {
    expect(rio.read(1)).toBe("h");
  });

  it("be able to handle to read(length, buffer)", () => {
    const buffer = new Uint8Array(1);
    const result = rio.read(1, buffer);
    expect(result).toBe("h");
    expect(new TextDecoder().decode(buffer)).toBe(result);
  });

  it("be able to handle to read(nil, buffer)", () => {
    const buffer = new Uint8Array(11);
    const result = rio.read(null, buffer);
    expect(result).toBe("hello world");
    expect(new TextDecoder().decode(buffer)).toBe(result);
  });

  it("rewind to the beginning when #rewind is called", () => {
    rio.rewind();
    expect(rio.read(1)).toBe("h");
    rio.rewind();
    expect(rio.read()).toBe("hello world");
  });

  it("be able to handle gets", () => {
    expect(rio.gets()).toBe("hello world");
    rio.rewind();
    expect(rio.gets()).toBe("hello world");
  });

  it("be able to handle size", () => {
    expect(rio.size).toBe("hello world".length);
    expect(rio.size).toBe("hello world".length);
    rio.rewind();
    expect(rio.gets()).toBe("hello world");
  });

  it("be able to handle each", () => {
    let array: string[] = [];
    rio.each((data: string) => {
      array.push(data);
    });
    expect(array).toEqual(["hello world"]);

    rio.rewind();
    array = [];
    rio.each((data: string) => {
      array.push(data);
    });
    expect(array).toEqual(["hello world"]);
  });

  it("not buffer into a Tempfile if no data has been read yet", () => {
    expect(rio.rewindableIo).toBeNull();
  });

  it("buffer into a Tempfile when data has been consumed for the first time", () => {
    rio.read(1);
    const tempfile = rio.rewindableIo;
    expect(tempfile).not.toBeNull();
    rio.read(1);
    const tempfile2 = rio.rewindableIo;
    expect(tempfile2.path()).toBe(tempfile.path());
  });

  it("close the underlying tempfile upon calling #close", () => {
    rio.read(1);
    const tempfile = rio.rewindableIo;
    rio.close();
    expect(tempfile.isClosed()).toBe(true);
  });

  it("handle partial writes to tempfile", () => {
    const superPosix = rio.isFilesystemHasPosixSemantics.bind(rio);
    rio.isFilesystemHasPosixSemantics = () => {
      const io = rio.rewindableIo;
      const superWrite = io.write.bind(io);
      io.write = (buffer: Uint8Array) => superWrite(buffer.slice(0, 2));
      return superPosix();
    };
    rio.read(1);
    const tempfile = rio.rewindableIo;
    rio.close();
    expect(tempfile.isClosed()).toBe(true);
  });

  it("close the underlying tempfile upon calling #close when not using posix semantics", () => {
    rio.isFilesystemHasPosixSemantics = () => false;
    rio.read(1);
    const tempfile = rio.rewindableIo;
    rio.close();
    expect(tempfile.isClosed()).toBe(true);
  });

  it("be possible to call #close when no data has been buffered yet", () => {
    expect(rio.close()).toBeNull();
  });

  it("be possible to call #close multiple times", () => {
    expect(rio.close()).toBeNull();
    expect(rio.close()).toBeNull();
  });
}

describe("Rack::RewindableInput", () => {
  describe("given an IO object that is already rewindable", () => {
    rewindableTest(() => new StringIO("hello world"));
  });

  describe("given an IO object that is not rewindable", () => {
    rewindableTest(() => {
      const io: any = new StringIO("hello world");
      io.rewind = undefined;
      return io;
    });
  });

  describe("given an IO object whose rewind method raises Errno::ESPIPE", () => {
    rewindableTest(() => {
      const io: any = new StringIO("hello world");
      io.rewind = () => {
        throw new Errno.ESPIPE("You can't rewind this!");
      };
      return io;
    });
  });
});

describe("Rack::RewindableInput::Middleware", () => {
  it("wraps rack.input in RewindableInput", async () => {
    let app: any = async (env: any) => [200, {}, [env["rack.input"].constructor.name]];
    expect((await app({ "rack.input": new StringIO("") }))[2]).toEqual(["StringIO"]);
    app = new RewindableInputMiddleware(app);
    expect((await app.call({ "rack.input": new StringIO("") }))[2]).toEqual(["RewindableInput"]);
  });
});
