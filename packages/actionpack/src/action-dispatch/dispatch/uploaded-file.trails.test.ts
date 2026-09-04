import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { UploadedFile } from "../http/upload.js";

describe("ActionDispatch::Http::UploadedFile", () => {
  let tmpDir: string;
  let tempfile: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uploaded-file-"));
    tempfile = path.join(tmpDir, "test.txt");
    fs.writeFileSync(tempfile, "hello world");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("read answers null at EOF and rewind starts the stream over", () => {
    const file = new UploadedFile({ tempfile });

    expect(file.read(5)!.toString("binary")).toBe("hello");
    expect(file.read(6)!.toString("binary")).toBe(" world");
    expect(file.read(1)).toBeNull();

    file.rewind();
    expect(file.read(5)!.toString("binary")).toBe("hello");
  });

  it("read fills the buffer it is handed", () => {
    const file = new UploadedFile({ content: "hello world" });
    const buffer = Buffer.alloc(5);

    expect(file.read(5, buffer)!.toString("binary")).toBe("hello");
    expect(buffer.toString("binary")).toBe("hello");
  });
});
