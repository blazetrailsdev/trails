import { describe, expect, it } from "vitest";
import { Encoding } from "./encoding.js";
import { File } from "./file.js";
import { Process } from "./process.js";
import { Tempfile } from "./tempfile.js";

describe("Tempfile", () => {
  const exists = (path: string): boolean => File.isExist(path);

  it("create returns a synchronous block's value without a Promise", () => {
    expect(Tempfile.create("foo", undefined, () => 42)).toBe(42);
  });

  it("create unlinks the file on block exit", () => {
    let path = "";
    Tempfile.create("foo", undefined, (tmpfile) => {
      path = tmpfile.path()!;
    });
    expect(path).not.toBe("");
    expect(exists(path)).toBe(false);
  });

  it("create unlinks the file when a synchronous block raises", () => {
    let path = "";
    expect(() =>
      Tempfile.create("foo", undefined, (tmpfile) => {
        path = tmpfile.path()!;
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(exists(path)).toBe(false);
  });

  it("create accepts a prefix and suffix pair", () => {
    Tempfile.create(["pre", "-post.yml"], undefined, (tmpfile) => {
      const basename = tmpfile.path()!.split(/[\\/]/).pop()!;
      expect(basename.startsWith("pre")).toBe(true);
      expect(basename.endsWith("-post.yml")).toBe(true);
    });
  });

  it("create awaits an async block before unlinking", async () => {
    let path = "";
    const value = await Tempfile.create("foo", undefined, async (tmpfile) => {
      path = tmpfile.path()!;
      tmpfile.write("hello");
      await Promise.resolve();
      expect(exists(path)).toBe(true);
      tmpfile.rewind();
      return tmpfile.read();
    });
    expect(value).toBe("hello");
    expect(exists(path)).toBe(false);
  });

  it("write appends and close flushes to the file", () => {
    const tempfile = Tempfile.open("foo");
    expect(tempfile.write("a")).toBe(1);
    tempfile.write("b");
    tempfile.close();
    expect(File.read(tempfile.path!)).toBe("ab");
    tempfile.unlink();
  });

  it("write reaches the file before close", () => {
    const tempfile = Tempfile.new("early");
    tempfile.write("hi");
    expect(File.read(tempfile.path!)).toBe("hi");
    tempfile.close();
    tempfile.unlink();
  });

  it("open leaves the file in place on block exit", () => {
    let path = "";
    const value = Tempfile.open("bar", undefined, (tempfile) => {
      path = tempfile.path!;
      tempfile.write("hi");
      return 7;
    });
    expect(value).toBe(7);
    expect(exists(path)).toBe(true);
    expect(File.read(path)).toBe("hi");
    File.delete(path);
  });

  it("without a block returns the open temp file", () => {
    const tmpfile = Tempfile.create("baz");
    const path = tmpfile.path()!;
    expect(exists(path)).toBe(true);
    tmpfile.close();
    File.delete(path);
    expect(exists(path)).toBe(false);
  });

  it("new gives each temp file a distinct name", () => {
    const a = Tempfile.new("dup");
    const b = Tempfile.new("dup");
    expect(a.path).not.toBe(b.path);
    a.unlink();
    b.unlink();
  });

  it("read gives back the bytes write was handed", () => {
    const bytes = [0x00, 0xff, 0x80, 0xc3, 0x28, 0xfe];
    const tempfile = Tempfile.new("bin");
    tempfile.binmode();
    tempfile.write(bytes.map((byte) => String.fromCharCode(byte)).join(""));
    expect(tempfile.read()).toBe("");
    tempfile.rewind();
    expect([...tempfile.read()].map((c) => c.charCodeAt(0))).toEqual(bytes);
    tempfile.close();
    tempfile.unlink();
  });

  it("create unlinks the file when an async block rejects", async () => {
    let path = "";
    await expect(
      Tempfile.create("foo", undefined, async (tmpfile) => {
        path = tmpfile.path()!;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(exists(path)).toBe(false);
  });

  it("set_encoding reads back the bytes write was handed unmodified", () => {
    const bytes = [0x00, 0xff, 0x80, 0xc3, 0x28, 0xfe];
    const tempfile = Tempfile.new("enc");
    tempfile.setEncoding(Encoding.BINARY);
    tempfile.write(bytes.map((byte) => String.fromCharCode(byte)).join(""));
    tempfile.rewind();
    expect([...tempfile.read()].map((c) => c.charCodeAt(0))).toEqual(bytes);
    tempfile.close();
    tempfile.unlink();
  });

  it("set_encoding accepts an encoding name and answers the delegated File", () => {
    const tempfile = Tempfile.new("enc");
    expect(tempfile.setEncoding("BINARY")).toBeInstanceOf(File);
    expect(() => tempfile.setEncoding("no-such-encoding")).toThrow(
      "unknown encoding name - no-such-encoding",
    );
    tempfile.close();
    tempfile.unlink();
  });

  it("new creates the file at 0600 in the open(2) call rather than by a chmod", () => {
    const chmod = File.chmod;
    File.chmod = () => {
      throw new Error("chmod must not be reached");
    };
    try {
      const tempfile = Tempfile.new("perm");
      expect(File.stat(tempfile.path!).mode & 0o777).toBe(0o600);
      tempfile.close();
      tempfile.unlink();
    } finally {
      File.chmod = chmod;
    }
  });

  it("the name carries the local date, the process id and a random draw", () => {
    const tempfile = Tempfile.new("stamp");
    const name = tempfile.path!.split("/").pop()!;
    const now = new Date();
    const t = `${String(now.getFullYear()).padStart(4, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

    expect(name).toMatch(new RegExp(`^stamp${t}-${Process.pid}-[0-9a-z]+$`));

    tempfile.close();
    tempfile.unlink();
  });
});
