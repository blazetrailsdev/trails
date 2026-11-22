import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { describe, it, expect } from "vitest";
import {
  ArgumentError,
  File,
  RUBY_PLATFORM,
  RuntimeError,
  StringIO,
  Tempfile,
} from "@blazetrails/ruby-compat";
import { UploadedFile } from "../lib/uploaded-file.js";
import { mustBe, mustRespondTo, wontBe } from "./support/assertions.js";

function filePath(): string {
  return File.dirname(new URL(import.meta.url).pathname) + "/fixtures/foo.txt";
}

function localPaths(n: number): string[] {
  const localPaths = Array.from({ length: n }, () => new UploadedFile(filePath()));
  expect(localPaths.map((f) => f.localPath!).every((f) => File.isExist(f))).toBe(true);
  const paths = localPaths.map((f) => f.localPath!);
  expect(new Set(paths).size).toBe(n);
  return paths;
}

async function gcStart(paths: string[]): Promise<void> {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
  setFlagsFromString("--expose-gc");
  const gc = runInNewContext("gc") as () => void;
  for (let i = 0; i < 50 && paths.every((f) => File.isExist(f)); i++) {
    await tick();
    gc();
    await tick();
  }
}

describe("Rack::Test::UploadedFile", () => {
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

  it("removes local paths on garbage collection", async () => {
    const paths = RUBY_PLATFORM() === "java" ? localPaths(500) : localPaths(50);
    await gcStart(paths);

    expect(paths.every((f) => File.isExist(f))).toBe(false);
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
