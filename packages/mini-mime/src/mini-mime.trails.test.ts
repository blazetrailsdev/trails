import { afterEach, describe, expect, it, vi } from "vitest";

describe("MiniMime::Db::PReadFile", () => {
  afterEach(() => {
    vi.doUnmock("@blazetrails/ruby-compat");
    vi.resetModules();
  });

  it("falls back to a seek-and-read PReadFile where File has no pread", async () => {
    vi.resetModules();
    vi.doMock("@blazetrails/ruby-compat", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@blazetrails/ruby-compat")>();
      return {
        ...actual,
        rbModMethodDefined: (mod: { prototype: object }, mid: string) =>
          mid === "pread" ? false : actual.rbModMethodDefined(mod, mid),
      };
    });
    const { File } = await import("@blazetrails/ruby-compat");
    const { MiniMime } = await import("./mini-mime.js");

    expect(MiniMime.Db.PReadFile).not.toBe(File);
    expect(MiniMime.lookupByExtension("zip")!.contentType).toBe("application/zip");
    expect(MiniMime.lookupByContentType("text/csv")!.extension).toBe("csv");
  });
});
