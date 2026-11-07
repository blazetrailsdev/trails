import { describe, it, expect } from "vitest";
import { NoMethodError, StringIO } from "@blazetrails/ruby-compat";
import { UploadedFile } from "../lib/uploaded-file.js";

describe("Rack::Test::UploadedFile (trails)", () => {
  it("raises NoMethodError for a name the tempfile does not answer", () => {
    const uploadedFile = new UploadedFile(new StringIO("bar"), "text/plain", false, {
      originalFilename: "foo.txt",
    }) as unknown as Record<string, () => unknown>;
    expect(() => uploadedFile.noSuchMethod()).toThrow(NoMethodError);
  });
});
