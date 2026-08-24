import { describe, expect, it } from "vitest";
import { getFsAsync } from "./fs-adapter.js";
import { Tempfile } from "./tempfile.js";

// Trails-only coverage: `Tempfile` is Ruby stdlib, so it has no Rails test to
// mirror. The expectations below were confirmed against MRI 3.3.
describe("Tempfile", () => {
  const exists = async (path: string): Promise<boolean> => (await getFsAsync()).exists(path);

  it("create returns the block value", async () => {
    expect(await Tempfile.create("foo", undefined, () => 42)).toBe(42);
  });

  it("create unlinks the file on block exit", async () => {
    let path = "";
    await Tempfile.create("foo", undefined, (tmpfile) => {
      path = tmpfile.path!;
    });
    expect(path).not.toBe("");
    expect(await exists(path)).toBe(false);
  });

  it("create unlinks the file when the block raises", async () => {
    let path = "";
    await expect(
      Tempfile.create("foo", undefined, (tmpfile) => {
        path = tmpfile.path!;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await exists(path)).toBe(false);
  });

  it("create accepts a prefix and suffix pair", async () => {
    await Tempfile.create(["pre", "-post.yml"], undefined, (tmpfile) => {
      const basename = tmpfile.path!.split(/[\\/]/).pop()!;
      expect(basename.startsWith("pre")).toBe(true);
      expect(basename.endsWith("-post.yml")).toBe(true);
    });
  });

  it("create awaits an async block before unlinking", async () => {
    let path = "";
    const value = await Tempfile.create("foo", undefined, async (tmpfile) => {
      path = tmpfile.path!;
      tmpfile.write("hello");
      expect(await exists(path)).toBe(true);
      return (await tmpfile.read()).toString("utf8");
    });
    expect(value).toBe("hello");
    expect(await exists(path)).toBe(false);
  });

  it("write appends and close flushes to the file", async () => {
    const tempfile = await Tempfile.open("foo");
    expect(tempfile.write("a")).toBe(1);
    tempfile.write("b");
    await tempfile.close();
    expect((await (await getFsAsync()).readFile!(tempfile.path!, "utf8")).toString()).toBe("ab");
    await tempfile.unlink();
  });

  it("open leaves the file in place on block exit", async () => {
    let path = "";
    const value = await Tempfile.open("bar", undefined, (tempfile) => {
      path = tempfile.path!;
      tempfile.write("hi");
      return 7;
    });
    expect(value).toBe(7);
    expect(await exists(path)).toBe(true);
    expect((await (await getFsAsync()).readFile!(path, "utf8")).toString()).toBe("hi");
    await (
      await getFsAsync()
    ).unlink!(path);
  });

  it("without a block returns the open temp file", async () => {
    const tmpfile = await Tempfile.create("baz");
    expect(await exists(tmpfile.path!)).toBe(true);
    const path = tmpfile.path!;
    await tmpfile.close(true);
    expect(await exists(path)).toBe(false);
    expect(tmpfile.path).toBeNull();
  });

  it("new gives each temp file a distinct name", async () => {
    const a = await Tempfile.new("dup");
    const b = await Tempfile.new("dup");
    expect(a.path).not.toBe(b.path);
    await a.unlink();
    await b.unlink();
  });
});
