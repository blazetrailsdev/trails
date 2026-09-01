import { describe, it, expect } from "vitest";
import { forceEncoding } from "./force-encoding.js";

describe("forceEncoding", () => {
  it("returns the buffer unchanged for a binary encoding", () => {
    const bytes = "cafÃ©";
    expect(forceEncoding(bytes, "BINARY")).toBe(bytes);
    expect(forceEncoding(bytes, "ASCII-8BIT")).toBe(bytes);
    expect(forceEncoding(bytes, "binary")).toBe(bytes);
  });

  it("reads the buffer's bytes back under the named encoding", () => {
    expect(forceEncoding("cafÃ©", "UTF-8")).toBe("café");
    expect(forceEncoding("é", "ISO-8859-1")).toBe("é");
  });

  it("leaves the buffer alone when the encoding has no decoder", () => {
    expect(forceEncoding("cafÃ©", "nope-8")).toBe("cafÃ©");
  });

  it("masks each character to its low byte", () => {
    expect(forceEncoding("Ł", "BINARY")).toBe("Ł");
    expect(forceEncoding("Ã©", "UTF-8")).toBe("é");
  });
});
