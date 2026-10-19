import * as path from "path";
import { describe, expect, it } from "vitest";

import { File, Tempfile } from "@blazetrails/ruby-compat";

import { MockRequest } from "../mock-request.js";
import { Generator } from "./generator.js";
import { MULTIPART_BOUNDARY } from "../multipart.js";
import { UploadedFile } from "./uploaded-file.js";

const fixtureDir = path.join(__dirname, "..", "..", "test", "multipart");
const logo = path.join(fixtureDir, "rack-logo.png");

describe("Rack::Multipart::UploadedFile", () => {
  it("reads its tempfile as a binary String regardless of the binary flag", () => {
    const size = File.stat(logo).size;

    expect(new UploadedFile(logo).read().length).toBe(size);
    expect(new UploadedFile(logo, { binary: true }).read().length).toBe(size);
  });

  it("copies the source file into a tempfile of its own", () => {
    const file = new UploadedFile(logo);

    expect(file.path).not.toBe(logo);
    expect(file.path!.endsWith(".png")).toBe(true);
    expect(File.stat(file.path!).size).toBe(File.stat(logo).size);

    (file.tempfile as Tempfile).write("clobber");
    expect(File.open(file.path!, "rb", (f) => f.read(7))).toBe("clobber");
    expect(File.open(logo, "rb", (f) => f.read(7))).not.toBe("clobber");
  });

  it("builds a body carrying the file's bytes, counted by CONTENT_LENGTH", () => {
    const raw = Buffer.from(
      File.open(logo, "rb", (f) => f.read(File.stat(logo).size) ?? ""),
      "latin1",
    );
    const files = new UploadedFile(logo);
    const data = new Generator({ "submit-name": "Larry", files }).dump() as string;

    expect(data).toContain(`--${MULTIPART_BOUNDARY}\r\n`);
    expect(Buffer.from(data, "latin1").includes(raw)).toBe(true);

    const env = MockRequest.envFor("/", { ":method": "post", ":params": { files } });
    expect(env["CONTENT_LENGTH"]).toBe(
      String(Buffer.from(env["rack.input"].string(), "latin1").length),
    );
  });
});
