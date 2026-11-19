import { describe, expect, it } from "vitest";
import { PG } from "../lib/index.js";

describe("PG::Result", () => {
  const native = {
    command: "SELECT",
    rowCount: 2,
    oid: 0,
    fields: [{ name: "n", dataTypeID: 23, dataTypeModifier: -1 }],
    rows: [["1"], ["2"]],
  } as unknown as ConstructorParameters<typeof PG.Result>[0];

  it("each without a block returns an enumerator sized by ntuples", () => {
    const enumerator = new PG.Result(native).each();
    expect(enumerator.size()).toBe(2);
    expect(enumerator.toA()).toEqual([{ n: "1" }, { n: "2" }]);
  });

  it("keeps one TextEncoder and TextDecoder module object", () => {
    const textEncoder = PG.TextEncoder;
    expect(PG.TextEncoder).toBe(textEncoder);
    expect(textEncoder.Array).toBeTypeOf("function");
    expect(PG.TextDecoder.Array).toBeTypeOf("function");
  });
});
