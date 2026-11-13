import { describe, expect, it } from "vitest";
import { ArgumentError, Generic, kernelURI, URI } from "../lib/index.js";

describe("kernelURI", () => {
  it("answers a URI unchanged and parses a String", () => {
    const uri = URI.parse("http://example.com/");
    expect(kernelURI(uri)).toBe(uri);
    expect(kernelURI("http://example.com:8080/x")).toBeInstanceOf(Generic);
    expect((kernelURI("http://example.com:8080/x") as Generic & { port: number }).port).toBe(8080);
  });

  it("raises ArgumentError for anything else", () => {
    expect(() => kernelURI(1)).toThrow(ArgumentError);
  });
});
