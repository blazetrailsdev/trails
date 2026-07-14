import { describe, expect, it } from "vitest";
import { BinaryData } from "@blazetrails/activemodel";
import { mysqlSchemaQuoter } from "./schema-quoter.js";

describe("mysqlSchemaQuoter", () => {
  // `quote` self-dispatches binary through its receiver, and the quoter object
  // *is* that receiver (both `quote` and the abstract `quoteDefaultExpression`
  // are invoked as its methods). Without `quotedBinary` on it, binary silently
  // degrades to the abstract byte-string form instead of MySQL's `x'..'` hex
  // (mysql/quoting.rb:80).
  it("quotes binary through MySQL's quotedBinary when host-less", () => {
    const q = mysqlSchemaQuoter();
    expect(q.quote(new Uint8Array([0xde, 0xad]))).toBe("x'dead'");
    expect(q.quote(new BinaryData(new Uint8Array([0xde, 0xad])))).toBe("x'dead'");
  });

  it("quotes a binary default through MySQL's quotedBinary when host-less", () => {
    const q = mysqlSchemaQuoter();
    expect(q.quoteDefaultExpression(new BinaryData(new Uint8Array([0xde, 0xad])))).toBe(
      " DEFAULT x'dead'",
    );
  });

  it("dispatches binary through a threaded host's quotedBinary override", () => {
    const q = mysqlSchemaQuoter({ quotedBinary: () => "OVERRIDDEN" });
    expect(q.quote(new BinaryData(new Uint8Array([0xde, 0xad])))).toBe("OVERRIDDEN");
  });
});
