import { describe, it, expect } from "vitest";
import * as path from "path";
import { UploadedFile } from "./uploaded-file.js";

const fixtureDir = path.join(__dirname, "..", "..", "test", "multipart");
const file1 = path.join(fixtureDir, "file1.txt");

describe("Rack::Multipart::UploadedFile", () => {
  it("raises a RuntimeError for invalid file path", () => {
    expect(() => new UploadedFile("non-existant")).toThrow();
  });

  it("supports uploading files in binary mode", () => {
    expect(new UploadedFile(file1).binmode).toBe(false);
    expect(new UploadedFile(file1, { binary: true }).binmode).toBe(true);
  });

  it("builds multipart body from StringIO", () => {
    const io = {
      read(): string {
        return "foo";
      },
    };
    const f = new UploadedFile({ io, filename: "bar.txt" });
    expect(f.originalFilename).toBe("bar.txt");
    expect(f.read()).toBe("foo");
    expect(f.path).toBeUndefined();
  });
});
