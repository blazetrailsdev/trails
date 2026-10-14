import { describe, it, expect } from "vitest";
import { b } from "./b.js";
import { forceEncoding } from "./force-encoding.js";
import { Encoding } from "../encoding.js";

describe("b", () => {
  it("copies the receiver rather than re-encoding it in place", () => {
    const str = "café";
    expect(b(str)).not.toBe(str);
    expect(str).toBe("café");
  });

  it("answers a string whose characters are the receiver's bytes", () => {
    expect(b("café")).toBe("cafÃ©");
    expect([...b("café")].every((c) => c.charCodeAt(0) < 0x100)).toBe(true);
  });

  it("answers the byte form of a String held as its bytes", () => {
    expect(b(new Uint8Array([0x63, 0xc3, 0xa9, 0xff]))).toBe("c\xc3\xa9\xff");
  });

  it("is the identity on 7-bit ASCII", () => {
    expect(b("Content-Disposition")).toBe("Content-Disposition");
  });

  it("preserves the receiver's bytes, so reading them back under UTF-8 restores it", () => {
    expect(forceEncoding(b("café"), Encoding.UTF_8)).toBe("café");
    expect(forceEncoding(b("café"), Encoding.BINARY)).toBe(b("café"));
  });
});
