import { describe, expect, it } from "vitest";
import { MiniMime } from "./mini-mime.js";

describe("MiniMimeTest", () => {
  it("that it has a version number", () => {
    expect(MiniMime.VERSION).not.toBeNull();
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
});
