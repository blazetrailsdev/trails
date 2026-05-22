import { describe, it, expect } from "vitest";
import * as path from "path";
import { Generator, MULTIPART_BOUNDARY } from "./generator.js";
import { UploadedFile } from "./uploaded-file.js";

const fixtureDir = path.join(__dirname, "..", "..", "test", "multipart");
const file1 = path.join(fixtureDir, "file1.txt");

describe("Rack::Multipart::Generator", () => {
  it("raises ArgumentError if params is not a Hash", () => {
    expect(() => new Generator("foo=bar" as never)).toThrow("value must be a Hash");
  });

  it("returns nil if no UploadedFiles were used", () => {
    const data = new Generator({
      people: [{ "submit-name": "Larry", files: "contents" }],
    }).dump();
    expect(data).toBeNull();
  });

  it("builds multipart body", () => {
    const files = new UploadedFile(file1);
    const data = new Generator({ "submit-name": "Larry", files }).dump() as string;
    expect(typeof data).toBe("string");
    expect(data).toContain(`--${MULTIPART_BOUNDARY}\r\n`);
    expect(data).toContain(`name="submit-name"`);
    expect(data).toContain("Larry");
    expect(data).toContain(`name="files"; filename="file1.txt"`);
    expect(data).toContain("content-type: text/plain");
    expect(data.endsWith(`--${MULTIPART_BOUNDARY}--\r`)).toBe(true);
  });

  it("builds nested multipart body using array", () => {
    const files = new UploadedFile(file1);
    const data = new Generator({
      people: [{ "submit-name": "Larry", files }],
    }).dump() as string;
    expect(data).toContain(`name="people[][submit-name]"`);
    expect(data).toContain(`name="people[][files]"; filename="file1.txt"`);
  });

  it("builds nested multipart body using hash", () => {
    const files = new UploadedFile(file1);
    const data = new Generator({
      people: { foo: { "submit-name": "Larry", files } },
    }).dump() as string;
    expect(data).toContain(`name="people[foo][submit-name]"`);
    expect(data).toContain(`name="people[foo][files]"; filename="file1.txt"`);
  });

  it("builds multipart body from StringIO", () => {
    const files = new UploadedFile({
      io: {
        read(): string {
          return "foo";
        },
      },
      filename: "bar.txt",
    });
    const data = new Generator({ "submit-name": "Larry", files }).dump() as string;
    expect(data).toContain(`name="files"; filename="bar.txt"`);
    expect(data).toContain("foo\r\n");
    // io-only uploads have no path, so no content-length line is emitted
    expect(data).not.toContain("content-length:");
  });
});
