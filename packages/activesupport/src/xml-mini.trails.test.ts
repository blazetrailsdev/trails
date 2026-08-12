import { describe, it, expect } from "vitest";
import { _parseBinary, _parseFile, _parseHexBinary, FileLike } from "./xml-mini.js";

// Rails exercises these through `XmlMini::PARSING` (xml_mini_test.rb:248) and
// `Hash.from_xml` (xml_mini_engine_test.rb:36), neither of which is ported yet,
// so the helpers are covered directly here.
describe("XmlMini", () => {
  it("_parse_hex_binary decodes hex to bytes", () => {
    expect(_parseHexBinary("48656C6C6F2C20576F726C6421")).toBe("Hello, World!");
  });

  it("_parse_binary decodes according to the entity encoding", () => {
    expect(_parseBinary("SGVsbG8=", { encoding: "base64" })).toBe("Hello");
    expect(_parseBinary("48656C6C6F", { encoding: "hex" })).toBe("Hello");
    expect(_parseBinary("48656C6C6F", { encoding: "hexBinary" })).toBe("Hello");
    expect(_parseBinary("IGNORED INPUT", {})).toBe("IGNORED INPUT");
  });

  it("_parse_file returns the decoded content decorated with FileLike", async () => {
    const file = _parseFile("SGVsbG8=", { name: "logo.png", content_type: "image/png" });
    expect(await file.text()).toBe("Hello");
    expect(file.originalFilename).toBe("logo.png");
    expect(file.contentType).toBe("image/png");
  });

  it("_parse_file falls back to the FileLike defaults", () => {
    const file = _parseFile("SGVsbG8=", {});
    expect(file.originalFilename).toBe("untitled");
    expect(file.contentType).toBe("application/octet-stream");
  });

  it("FileLike readers default until written", () => {
    const f = Object.defineProperties(
      {},
      Object.getOwnPropertyDescriptors(FileLike),
    ) as typeof FileLike;
    expect(f.originalFilename).toBe("untitled");
    f.originalFilename = "avatar.gif";
    expect(f.originalFilename).toBe("avatar.gif");
  });
});
