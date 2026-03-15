import { describe, expect, it } from "vitest";
import { extractOptions } from "../../index.js";

describe("ExtractOptionsTest", () => {
  it("extract options", () => {
    const [args, opts] = extractOptions(["a", "b", { limit: 10 }]);
    expect(args).toEqual(["a", "b"]);
    expect(opts).toEqual({ limit: 10 });
  });

  it("extract options doesnt extract hash subclasses", () => {
    // Non-object trailing args are not extracted
    const [args, opts] = extractOptions(["a", "b"]);
    expect(args).toEqual(["a", "b"]);
    expect(opts).toEqual({});
  });

  it("extract options extracts extractable subclass", () => {
    const [args, opts] = extractOptions([{ extractable: true }]);
    expect(args).toEqual([]);
    expect(opts).toEqual({ extractable: true });
  });

  it("extract options extracts hash with indifferent access", () => {
    const [args, opts] = extractOptions(["a", { key: "value" }]);
    expect(args).toEqual(["a"]);
    expect(opts.key).toBe("value");
  });

  it("extract options extracts ordered options", () => {
    const [args, opts] = extractOptions([{ z: 1, a: 2 }]);
    expect(args).toEqual([]);
    expect(opts).toEqual({ z: 1, a: 2 });
  });
});
