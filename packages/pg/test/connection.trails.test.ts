import { describe, expect, it, vi } from "vitest";

describe("PG.connect", () => {
  it("raises LoadError when the pg npm package cannot be resolved", async () => {
    vi.resetModules();
    vi.doMock("pg", () => {
      throw Object.assign(new Error("Cannot find package 'pg'"), { code: "ERR_MODULE_NOT_FOUND" });
    });
    try {
      const { PG } = await import("../lib/index.js");
      const { LoadError } = await import("@blazetrails/ruby-compat");
      const error = await PG.connect({}).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LoadError);
      expect((error as InstanceType<typeof LoadError>).message).toBe("cannot load such file -- pg");
    } finally {
      vi.doUnmock("pg");
      vi.resetModules();
    }
  });
});
