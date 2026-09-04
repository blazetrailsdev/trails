import { describe, expect, it } from "vitest";
import { pack } from "./array.js";

describe("Array#pack", () => {
  const long = "a".repeat(100);

  it("m0 is strict Base64 with no line breaks", () => {
    expect(pack([long], "m0")).toBe(
      "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYQ==",
    );
  });

  it("m wraps at 60 characters and ends with a newline", () => {
    expect(pack([long], "m")).toBe(
      "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh\n" +
        "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh\n" +
        "YWFhYWFhYWFhYQ==\n",
    );
  });

  it("m6 wraps at the given input width rounded down to a multiple of three", () => {
    expect(pack([long], "m6")).toBe(pack([long], "m6"));
    expect(pack(["abcdefghi"], "m6")).toBe("YWJjZGVm\nZ2hp\n");
  });

  it("m* is m, not m0", () => {
    expect(pack([long], "m*")).toBe(pack([long], "m"));
  });

  it("pads a partial trailing group", () => {
    expect(pack(["ab"], "m0")).toBe("YWI=");
    expect(pack(["a"], "m0")).toBe("YQ==");
    expect(pack(["abc"], "m0")).toBe("YWJj");
  });

  it("encodes the empty string as the empty string", () => {
    expect(pack([""], "m")).toBe("");
    expect(pack([""], "m0")).toBe("");
  });

  it("packs the HTTP Basic credential Rack::Test builds", () => {
    expect(pack(["user:pass"], "m0")).toBe("dXNlcjpwYXNz");
  });
});
