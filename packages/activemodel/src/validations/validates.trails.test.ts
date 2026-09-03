import { describe, it, expect } from "vitest";

import { Model } from "../index.js";
import { Range } from "@blazetrails/ruby-compat";

describe("ValidatesTest (trails)", () => {
  it("parses a Range option into :in, as validates.rb:170 does", () => {
    expect(Model._parseValidatesOptions(new Range(6, 20))).toEqual({ in: new Range(6, 20) });
    expect(Model._parseValidatesOptions([1, 2])).toEqual({ in: [1, 2] });
    expect(Model._parseValidatesOptions(true)).toEqual({});
    expect(Model._parseValidatesOptions({ in: [1] })).toEqual({ in: [1] });
    expect(Model._parseValidatesOptions(/x/)).toEqual({ with: /x/ });
  });
});
