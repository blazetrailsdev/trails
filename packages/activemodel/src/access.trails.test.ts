import { describe, expect, it } from "vitest";
import { Access } from "./access.js";

describe("Access", () => {
  it("flattens nested arrays and sends String names as well as Symbols", () => {
    const point = Object.assign(new Access(), { x: 1, y: 2, z: 3 });
    expect(point.valuesAt("x", [":y", ["z"]])).toEqual([1, 2, 3]);
    expect([...point.slice(["x", [":z"]]).keys()]).toEqual(["x", "z"]);
  });
});
