import { describe, expect, it } from "vitest";
import { Base64 } from "./base64.js";

describe("Mail::Encodings::Base64", () => {
  it("encodes non-ASCII text over its UTF-8 bytes", () => {
    expect(Base64.encode("café ☃")).toEqual("Y2Fmw6kg4piD\r\n");
  });
});
