import * as path from "path";
import { describe, expect, it } from "vitest";

import { getFs } from "@blazetrails/activesupport";

import { MockRequest } from "../mock-request.js";
import { Generator, MULTIPART_BOUNDARY } from "./generator.js";
import { UploadedFile } from "./uploaded-file.js";

const fixtureDir = path.join(__dirname, "..", "..", "test", "multipart");
const logo = path.join(fixtureDir, "rack-logo.png");

// `Tempfile.new(..., encoding: Encoding::BINARY)` (uploaded_file.rb:24) opens the
// tempfile in BINARY whether or not `binary:` was passed, so the contents are a
// one-character-per-byte ASCII-8BIT String and `Generator#dump`'s body length is
// the byte length `MockRequest.env_for` writes to CONTENT_LENGTH
// (mock_request.rb:131).
describe("Rack::Multipart::UploadedFile", () => {
  it("reads its tempfile as a binary String regardless of the binary flag", () => {
    const size = getFs().statSync(logo).size;

    expect((new UploadedFile(logo).read() as string).length).toBe(size);
    expect((new UploadedFile(logo, { binary: true }).read() as string).length).toBe(size);
  });

  it("builds a body carrying the file's bytes, counted by CONTENT_LENGTH", () => {
    const raw = getFs().readFileSync(logo);
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
