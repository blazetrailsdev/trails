import { describe, expect, it } from "vitest";
import { isBlank, isPresent } from "@blazetrails/activesupport";
import { UploadedFile } from "./uploaded-file.js";

const thisFile = new URL(import.meta.url).pathname;

describe("Rack::Test::UploadedFile", () => {
  it("is neither blank nor absent", () => {
    const uploadedFile = new UploadedFile(thisFile);
    expect(isBlank(uploadedFile)).toBe(false);
    expect(isPresent(uploadedFile)).toBe(true);
  });
});
