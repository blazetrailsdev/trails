import { describe, it, expect } from "vitest";
import { ArgumentError, File, RuntimeError, StringIO, Tempfile } from "@blazetrails/ruby-compat";
import { UploadedFile } from "./uploaded-file.js";
import { mustBe, mustRespondTo, wontBe } from "./test-helpers/assertions.js";

describe("Rack::Test::UploadedFile", () => {
  function filePath(): string {
    return File.dirname(new URL(import.meta.url).pathname) + "/fixtures/foo.txt";
  }

  function binmodeHost(uploadedFile: UploadedFile): Record<string, () => unknown> {
    return uploadedFile.tempfile as unknown as Record<string, () => unknown>;
  }

  it("returns an instance of `Rack::Test::UploadedFile`", () => {
    const uploadedFile = new UploadedFile(filePath());

    expect(uploadedFile.constructor).toBe(UploadedFile);
  });

  it("responds to things that Tempfile responds to", () => {
    const uploadedFile = new UploadedFile(filePath());

    for (const method of Object.getOwnPropertyNames(Tempfile.prototype)) {
      if (method === "constructor") continue;
      mustRespondTo(uploadedFile, method);
    }
  });

  it("creates Tempfiles with original file's extension", () => {
    const uploadedFile = new UploadedFile(filePath());

    expect(File.extname(uploadedFile.path!)).toBe(".txt");
  });

  it("creates Tempfiles with a path that includes a single extension", () => {
    const uploadedFile = new UploadedFile(filePath());

    const regex = new RegExp(`foo${new Date().getFullYear()}.*\\.txt$`);
    expect(uploadedFile.path).toMatch(regex);
  });

  it("allows to override the Tempfiles original_filename", () => {
    const uploadedFile = new UploadedFile(filePath(), "text/plain", false, {
      originalFilename: "bar.txt",
    });
    const regex = new RegExp(`bar${new Date().getFullYear()}.*\\.txt$`);

    expect(uploadedFile.path).toMatch(regex);
  });

  it("respects binary argument", () => {
    mustBe(binmodeHost(new UploadedFile(filePath(), "text/plain", true)), "isBinmode");
    wontBe(binmodeHost(new UploadedFile(filePath(), "text/plain", false)), "isBinmode");
    wontBe(binmodeHost(new UploadedFile(filePath(), "text/plain")), "isBinmode");
  });

  it("raises for invalid files", () => {
    expect(() => new UploadedFile("does_not_exist")).toThrow(RuntimeError);
  });

  it.skip("removes local paths on garbage collection", () => {
    // PERMANENT-SKIP: the assertion is that `GC.start` runs Tempfile's finalizer
    // (`vendor/ruby/lib/tempfile.rb:299`) and unlinks the file. JS has no
  });

  it("#initialize with an IO object sets the specified filename", () => {
    const originalFilename = "content.txt";
    const uploadedFile = new UploadedFile(new StringIO("I am content"), "text/plain", false, {
      originalFilename,
    });
    expect(uploadedFile.originalFilename).toBe(originalFilename);
  });

  it("#initialize without an original filename raises an error", () => {
    expect(() => new UploadedFile(new StringIO("I am content"))).toThrow(ArgumentError);
  });
});
