import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { UploadedFile } from "./uploaded-file.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-test-"));
  fs.writeFileSync(path.join(tmpDir, "test.txt"), "hello world");
  fs.writeFileSync(path.join(tmpDir, "empty.txt"), "");
  fs.writeFileSync(path.join(tmpDir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ==========================================================================
// dispatch/uploaded_file_test.rb
// ==========================================================================
describe("ActionDispatch::Http::UploadedFile", () => {
  it("original filename", () => {
    const file = new UploadedFile({ filename: "photo.jpg" });
    expect(file.originalFilename).toBe("photo.jpg");
  });

  it("content type", () => {
    const file = new UploadedFile({ type: "image/jpeg" });
    expect(file.contentType).toBe("image/jpeg");
  });

  it("default content type", () => {
    const file = new UploadedFile();
    expect(file.contentType).toBe("application/octet-stream");
  });

  it("headers", () => {
    const file = new UploadedFile({ head: "Content-Disposition: form-data" });
    expect(file.headers).toBe("Content-Disposition: form-data");
  });

  it("extname", () => {
    const file = new UploadedFile({ filename: "photo.jpg" });
    expect(file.extname).toBe(".jpg");
  });

  it("extname with no extension", () => {
    const file = new UploadedFile({ filename: "Makefile" });
    expect(file.extname).toBe("");
  });

  it("extname with multiple dots", () => {
    const file = new UploadedFile({ filename: "archive.tar.gz" });
    expect(file.extname).toBe(".gz");
  });

  it("size from content", () => {
    const file = new UploadedFile({ content: "hello" });
    expect(file.size).toBe(5);
  });

  it("size from tempfile", () => {
    const file = new UploadedFile({ tempfile: path.join(tmpDir, "test.txt") });
    expect(file.size).toBe(11); // "hello world"
  });

  it("size when empty", () => {
    const file = new UploadedFile();
    expect(file.size).toBe(0);
  });

  it("read from content", () => {
    const file = new UploadedFile({ content: "hello world" });
    expect(file.readAsString()).toBe("hello world");
  });

  it("read from tempfile", () => {
    const file = new UploadedFile({ tempfile: path.join(tmpDir, "test.txt") });
    expect(file.readAsString()).toBe("hello world");
  });

  it("read binary content", () => {
    const buf = Buffer.from([1, 2, 3, 4]);
    const file = new UploadedFile({ content: buf });
    expect(file.read()).toEqual(buf);
  });

  it("read from tempfile binary", () => {
    const file = new UploadedFile({ tempfile: path.join(tmpDir, "image.png") });
    const data = file.read();
    expect(data[0]).toBe(0x89);
    expect(data.length).toBe(4);
  });

  it("empty file", () => {
    const file = new UploadedFile();
    expect(file.empty).toBe(true);
  });

  it("non empty file", () => {
    const file = new UploadedFile({ content: "data" });
    expect(file.empty).toBe(false);
  });

  it("write", () => {
    const file = new UploadedFile({ content: "hello" });
    file.write(" world");
    expect(file.readAsString()).toBe("hello world");
  });

  it("close", () => {
    const file = new UploadedFile();
    expect(file.closed).toBe(false);
    file.close();
    expect(file.closed).toBe(true);
  });

  it("valid file", () => {
    const file = new UploadedFile({ filename: "test.txt", content: "data" });
    expect(file.valid).toBe(true);
  });

  it("invalid file no filename", () => {
    const file = new UploadedFile({ content: "data" });
    expect(file.valid).toBe(false);
  });

  it("invalid file no content", () => {
    const file = new UploadedFile({ filename: "test.txt" });
    expect(file.valid).toBe(false);
  });

  it("to string", () => {
    const file = new UploadedFile({ filename: "test.txt", type: "text/plain", content: "hi" });
    const str = file.toString();
    expect(str).toContain("test.txt");
    expect(str).toContain("text/plain");
    expect(str).toContain("size=2");
  });

  it("inspect", () => {
    const file = new UploadedFile({ filename: "test.txt", content: "hi" });
    expect(file.inspect()).toBe(file.toString());
  });

  it("tempfile path", () => {
    const tmpPath = path.join(tmpDir, "test.txt");
    const file = new UploadedFile({ tempfile: tmpPath });
    expect(file.tempfilePath).toBe(tmpPath);
  });

  it("tempfile path when none", () => {
    const file = new UploadedFile();
    expect(file.tempfilePath).toBeNull();
  });

  it("rewind does not throw", () => {
    const file = new UploadedFile({ content: "data" });
    expect(() => file.rewind()).not.toThrow();
  });
});
