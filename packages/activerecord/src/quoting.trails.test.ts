import { describe, it, expect } from "vitest";
import { Chars } from "@blazetrails/activesupport";
import { quotingHost } from "./support/quoting-host.js";
import { typeCast } from "./connection-adapters/abstract/quoting.js";

describe("TypeCastingTest (trails)", () => {
  it("type cast mb chars", () => {
    expect(typeCast.call(quotingHost(), new Chars("lo\\l"))).toBe("lo\\l");
  });
});
