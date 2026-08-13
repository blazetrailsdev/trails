import { describe, expect, it } from "vitest";
import { extractOptionsBang } from "../../index.js";

describe("ExtractOptionsTest", () => {
  it("extract options", () => {
    const [args, opts] = extractOptionsBang(["a", "b", { limit: 10 }]);
    expect(args).toEqual(["a", "b"]);
    expect(opts).toEqual({ limit: 10 });
  });

  it("extract options doesnt extract hash subclasses", () => {
    // Non-object trailing args are not extracted
    const [args, opts] = extractOptionsBang(["a", "b"]);
    expect(args).toEqual(["a", "b"]);
    expect(opts).toEqual({});
  });

  it("extract options extracts extractable subclass", () => {
    const [args, opts] = extractOptionsBang([{ extractable: true }]);
    expect(args).toEqual([]);
    expect(opts).toEqual({ extractable: true });
  });

  it("extract options extracts hash with indifferent access", () => {
    const [args, opts] = extractOptionsBang(["a", { key: "value" }]);
    expect(args).toEqual(["a"]);
    expect(opts.key).toBe("value");
  });

  it("extract options extracts ordered options", () => {
    const [args, opts] = extractOptionsBang([{ z: 1, a: 2 }]);
    expect(args).toEqual([]);
    expect(opts).toEqual({ z: 1, a: 2 });
  });
});
