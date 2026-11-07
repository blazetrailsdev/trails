import { describe, expect, it } from "vitest";
import { isBlank, isPresent } from "@blazetrails/activesupport";
import { NoMethodError, StringIO } from "@blazetrails/ruby-compat";
import { UploadedFile } from "../lib/uploaded-file.js";

const thisFile = new URL(import.meta.url).pathname;

describe("Rack::Test::UploadedFile", () => {
  it("is neither blank nor absent", () => {
    const uploadedFile = new UploadedFile(thisFile);
    expect(isBlank(uploadedFile)).toBe(false);
    expect(isPresent(uploadedFile)).toBe(true);
  });

  it("raises NoMethodError for a name the tempfile does not answer", () => {
    const uploadedFile = new UploadedFile(new StringIO("bar"), "text/plain", false, {
      originalFilename: "foo.txt",
    }) as unknown as Record<string, () => unknown>;
    expect(() => uploadedFile.noSuchMethod()).toThrow(NoMethodError);
  });
});
