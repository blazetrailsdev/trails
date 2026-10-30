import { describe, expect, it } from "vitest";
import { ContentTransferEncodingParser } from "./content-transfer-encoding-parser.js";

describe("ContentTransferEncodingParser", () => {
  it("should work", () => {
    const text = "quoted-printable";
    const a = ContentTransferEncodingParser;
    expect(a.parse(text).error).toBeNull();
    expect(a.parse(text).encoding).toBe("quoted-printable");
  });

  describe("trailing semi colons", () => {
    it("should parse", () => {
      const text = "quoted-printable;";
      const a = ContentTransferEncodingParser;
      expect(a.parse(text).error).toBeNull();
      expect(a.parse(text).encoding).toBe("quoted-printable");
    });

    it("should parse with pre white space", () => {
      const text = "quoted-printable  ;";
      const a = ContentTransferEncodingParser;
      expect(a.parse(text).error).toBeNull();
      expect(a.parse(text).encoding).toBe("quoted-printable");
    });

    it("should parse with trailing white space", () => {
      const text = "quoted-printable; ";
      const a = ContentTransferEncodingParser;
      expect(a.parse(text).error).toBeNull();
      expect(a.parse(text).encoding).toBe("quoted-printable");
    });

    it("should parse with pre and trailing white space", () => {
      const text = "quoted-printable  ;  ";
      const a = ContentTransferEncodingParser;
      expect(a.parse(text).error).toBeNull();
      expect(a.parse(text).encoding).toBe("quoted-printable");
    });
  });

  describe("x-token values", () => {
    it("should work", () => {
      const text = "x-my-token";
      const a = ContentTransferEncodingParser;
      expect(a.parse(text).error).toBeNull();
      expect(a.parse(text).encoding).toBe("x-my-token");
    });
  });

  describe("wild content-transfer-encoding", () => {
    for (const mechanism of ["7bits", "8bits", "7-bit", "8-bit"]) {
      it(`should parse ${mechanism} variant`, () => {
        const a = ContentTransferEncodingParser;
        expect(a.parse(mechanism).error).toBeNull();
        expect(a.parse(mechanism).encoding).toBe(mechanism);
      });
    }
  });
});
