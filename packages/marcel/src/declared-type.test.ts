import { MimeType } from "./mime-type.js";
import { expect, it, describe } from "vitest";

describe("Marcel::MimeType::DeclaredTypeTest", () => {
  it("prefers declared type over filename extension", async () => {
    expect(await MimeType.for(undefined, { name: "file.txt", declaredType: "text/html" })).toEqual(
      "text/html",
    );
  });

  it("prefers filename extension over binary type", async () => {
    expect(
      await MimeType.for(undefined, { name: "file.txt", declaredType: "application/octet-stream" }),
    ).toEqual("text/plain");
  });

  it("defaults to binary if declared type is unrecognized", async () => {
    expect(await MimeType.for(undefined, { declaredType: null })).toEqual(
      "application/octet-stream",
    );
    expect(await MimeType.for(undefined, { declaredType: "" })).toEqual("application/octet-stream");
    expect(await MimeType.for(undefined, { declaredType: "unrecognised" })).toEqual(
      "application/octet-stream",
    );
  });

  it("ignores charset declarations", async () => {
    expect(await MimeType.for(undefined, { declaredType: "text/html; charset=utf-8" })).toEqual(
      "text/html",
    );
  });
});
