import { describe, expect, it } from "vitest";

import { Entry } from "./entry.js";

describe("CacheEntryTest", () => {
  it.skip("expired");
  it.skip("initialize with expires at");

  // Not a Rails-ported test: guards the convergence of the compressed non-String
  // #bytesize branch to Rails' `Marshal.dump(@value).bytesize` framing overhead.
  it("bytesize of a compressed Array includes Marshal framing overhead", () => {
    const value = Array.from({ length: 200 }, (_, i) => i % 10);
    const compressed = new Entry(value).compressed(1);

    expect(compressed.isCompressed()).toBe(true);
    // The deflated payload is a latin1 string (one char per byte); Rails wraps
    // it in Marshal framing: 2-byte version + 1-byte String tag + Marshal-encoded
    // length + the bytes. So bytesize exceeds the raw payload length.
    const payloadBytes = (compressed as unknown as { _value: string })._value.length;
    const lengthBytes = payloadBytes <= 122 ? 1 : payloadBytes <= 255 ? 2 : 3;
    expect(compressed.bytesize()).toBe(2 + 1 + lengthBytes + payloadBytes);
    expect(compressed.bytesize()).toBeGreaterThan(payloadBytes);
  });

  // A compressed String keeps Rails' `@value.bytesize` (no Marshal framing),
  // since the uncompressed value is still a String (entry.rb:62-63).
  it("bytesize of a compressed String is the raw payload byte count", () => {
    const value = "a".repeat(500);
    const compressed = new Entry(value).compressed(1);

    expect(compressed.isCompressed()).toBe(true);
    const payloadBytes = (compressed as unknown as { _value: string })._value.length;
    expect(compressed.bytesize()).toBe(payloadBytes);
  });
});
