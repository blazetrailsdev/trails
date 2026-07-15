import { describe, expect, it } from "vitest";
import { BinaryData, BinaryType } from "@blazetrails/activemodel";
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
    // The abstract quoteDefaultExpression self-dispatches `quote`
    // (abstract/quoting.rb:162), so both shapes reach MySQL's `x'..'` — the raw
    // Uint8Array trails' BinaryType#serialize actually returns (which the
    // abstract `quote` alone would reject with "can't quote Uint8Array") and the
    // BinaryData Rails' Binary#serialize returns.
    expect(q.quoteDefaultExpression(new Uint8Array([0xde, 0xad]))).toBe(" DEFAULT x'dead'");
    expect(q.quoteDefaultExpression(new BinaryData(new Uint8Array([0xde, 0xad])))).toBe(
      " DEFAULT x'dead'",
    );
  });

  it("quotes a binary default produced by BinaryType#serialize", () => {
    const q = mysqlSchemaQuoter();
    expect(q.quoteDefaultExpression(new BinaryType().serialize("ab"))).toBe(" DEFAULT x'6162'");
  });

  it("dispatches binary through a threaded host's quotedBinary override", () => {
    const q = mysqlSchemaQuoter({ quotedBinary: () => "OVERRIDDEN" });
    expect(q.quote(new BinaryData(new Uint8Array([0xde, 0xad])))).toBe("OVERRIDDEN");
  });
});
