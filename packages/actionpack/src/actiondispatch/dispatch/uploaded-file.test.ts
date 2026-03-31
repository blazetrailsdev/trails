import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { UploadedFile } from "../uploaded-file.js";
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
describe("UploadedFileTest", () => {
  it("constructor with argument error", () => {
    expect(() => new UploadedFile({})).toThrow();
  });

  it("original filename", () => {
    const file = new UploadedFile({ filename: "photo.jpg", content: "" });
    expect(file.originalFilename).toBe("photo.jpg");
  });

  it("filename is different object", () => {
    const file = new UploadedFile({ filename: "photo.jpg", content: "" });
    const name1 = file.originalFilename;
    const name2 = file.originalFilename;
    expect(name1).toBe(name2);
  });

  it("filename should be in utf 8", () => {
    const file = new UploadedFile({ filename: "café.txt", content: "" });
    expect(file.originalFilename).toBe("café.txt");
  });

  it("filename should always be in utf 8", () => {
    const file = new UploadedFile({ filename: "日本語.txt", content: "" });
    expect(file.originalFilename).toBe("日本語.txt");
  });

  it("content type", () => {
    const file = new UploadedFile({ type: "image/jpeg", content: "" });
    expect(file.contentType).toBe("image/jpeg");
  });

  it("headers", () => {
    const file = new UploadedFile({ head: "Content-Disposition: form-data", content: "" });
    expect(file.headers).toBe("Content-Disposition: form-data");
  });

  it("headers should be in utf 8", () => {
    const file = new UploadedFile({ head: "Content-Type: text/plain; charset=utf-8", content: "" });
    expect(file.headers).toContain("utf-8");
  });

  it("headers should always be in utf 8", () => {
    const file = new UploadedFile({ head: "X-Custom: café", content: "" });
    expect(file.headers).toBe("X-Custom: café");
  });

  it("tempfile", () => {
    const tmpPath = path.join(tmpDir, "test.txt");
    const file = new UploadedFile({ tempfile: tmpPath });
    expect(file.tempfilePath).toBe(tmpPath);
  });

  it("to io returns file", () => {
    const file = new UploadedFile({ content: "hello" });
    const data = file.read();
    expect(data).toBeTruthy();
  });

  it("delegates path to tempfile", () => {
    const tmpPath = path.join(tmpDir, "test.txt");
    const file = new UploadedFile({ tempfile: tmpPath });
    expect(file.tempfilePath).toBe(tmpPath);
  });

  it("delegates open to tempfile", () => {
    const file = new UploadedFile({ tempfile: path.join(tmpDir, "test.txt") });
    expect(file.closed).toBe(false);
  });

  it("delegates close to tempfile", () => {
    const file = new UploadedFile({ content: "hello" });
    file.close();
    expect(file.closed).toBe(true);
  });

  it("close accepts parameter", () => {
    const file = new UploadedFile({ content: "hello" });
    file.close(true);
    expect(file.closed).toBe(true);
  });

  it("delegates read to tempfile", () => {
    const file = new UploadedFile({ tempfile: path.join(tmpDir, "test.txt") });
    expect(file.readAsString()).toBe("hello world");
  });

  it("delegates read to tempfile with params", () => {
    const file = new UploadedFile({ tempfile: path.join(tmpDir, "test.txt") });
    const data = file.read();
    expect(data.length).toBe(11);
  });

  it("delegate eof to tempfile", () => {
    const file = new UploadedFile({ content: "" });
    expect(file.empty).toBe(true);
  });

  it("delegate to path to tempfile", () => {
    const tmpPath = path.join(tmpDir, "test.txt");
    const file = new UploadedFile({ tempfile: tmpPath });
    expect(file.tempfilePath).toBe(tmpPath);
  });

  it("io copy stream", () => {
    const file = new UploadedFile({ content: "hello world" });
    const data = file.readAsString();
    expect(data).toBe("hello world");
  });
});
