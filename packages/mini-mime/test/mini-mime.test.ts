import { beforeAll, describe, expect, it } from "vitest";
import { MiniMime } from "../lib/mini-mime.js";
import { MIME } from "./support/mime-types.js";

describe("MiniMimeTest", () => {
  it("that it has a version number", () => {
    expect(MiniMime.VERSION).toBeDefined();
  });

  it("extension", () => {
    expect(MiniMime.lookupByExtension("zip")!.contentType).toBe("application/zip");
  });

  it("mixed case", () => {
    expect(MiniMime.lookupByFilename("a.GTM")!.contentType).toBe(
      "application/vnd.groove-tool-message",
    );
    expect(MiniMime.lookupByExtension("ZiP")!.contentType).toBe("application/zip");
  });

  it("content type", () => {
    expect(MiniMime.lookupByFilename("a.123")!.contentType).toBe("application/vnd.lotus-1-2-3");
    expect(MiniMime.lookupByFilename("a.Z")!.contentType).toBe("application/x-compressed");
    expect(MiniMime.lookupByFilename("a.gtm")!.contentType).toBe(
      "application/vnd.groove-tool-message",
    );
    expect(MiniMime.lookupByFilename("a.zmm")!.contentType).toBe(
      "application/vnd.HandHeld-Entertainment+xml",
    );
    expect(MiniMime.lookupByFilename("x.csv")!.contentType).toBe("text/csv");
    expect(MiniMime.lookupByFilename("x.mda")!.contentType).toBe("application/x-msaccess");

    expect(MiniMime.lookupByFilename("a.frog")).toBeNull();
  });

  it("binary", () => {
    expect(MiniMime.lookupByFilename("a.z")!.isBinary()).toBeTruthy();
    expect(MiniMime.lookupByFilename("a.Z")!.isBinary()).toBeTruthy();
    expect(MiniMime.lookupByFilename("a.txt")!.isBinary()).toBeFalsy();
    expect(MiniMime.lookupByFilename("a.frog")).toBeNull();
  });

  it("binary content type", () => {
    expect(MiniMime.lookupByContentType("application/x-compressed")!.isBinary()).toBeTruthy();
    expect(MiniMime.lookupByContentType("something-fake")).toBeNull();
    expect(MiniMime.lookupByContentType("text/plain")!.isBinary()).toBeFalsy();
  });

  describe("with MIME::Types", () => {
    beforeAll(async () => {
      await MIME.Types.loadDefaultMimeTypes();
    });

    it("full parity with mime types", () => {
      const exts = new Set<string>();
      MIME.Types.each((type) => {
        type.extensions.forEach((ext) => exts.add(ext));
      });

      const differences: string[] = [];

      for (const ext of exts) {
        const types = MIME.Types.typeFor(`a.${ext}`);

        let type = types.find((t) => !t.isObsolete());
        type ??= types.find((t) => t.registered);
        type ??= types[0];

        const expected = type.contentType;
        const actual = MiniMime.lookupByFilename(`a.${ext}`)!.contentType;

        if (expected !== actual) {
          differences.push(
            `Expected ".${ext}" to return ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`,
          );
        }
      }

      expect(differences.length === 0, differences.join("\n")).toBe(true);
    });
  });
});
