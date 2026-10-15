import { describe, it, expect } from "vitest";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import { OrderedHash } from "./ordered-hash.js";

describe("OrderedHash !omap", () => {
  it("round-trips a non-String key through YAML", () => {
    const orderedHash = new OrderedHash<number, string>([
      [1, "a"],
      [2, "b"],
    ]);
    const yaml = YAML.dump(orderedHash);
    expect(yaml).toBe("--- !omap\n- 1: a\n- 2: b\n");
    expect([...(YAML.unsafeLoad(yaml) as OrderedHash<number, string>)]).toEqual([
      [1, "a"],
      [2, "b"],
    ]);
  });
});
