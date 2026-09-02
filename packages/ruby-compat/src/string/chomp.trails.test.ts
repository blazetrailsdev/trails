import { describe, expect, it } from "vitest";
import { chomp } from "./chomp.js";

describe("String#chomp", () => {
  it("removes a single trailing newline", () => {
    expect(chomp("hello\n")).toBe("hello");
  });
  it("removes a trailing CRLF", () => {
    expect(chomp("hello\r\n")).toBe("hello");
  });
  it("removes a lone trailing CR", () => {
    expect(chomp("hello\r")).toBe("hello");
  });
  it("removes only one record separator", () => {
    expect(chomp("hello\n\n")).toBe("hello\n");
  });
  it("returns the string unchanged when it has no trailing newline", () => {
    expect(chomp("hello")).toBe("hello");
  });
  it("removes the given suffix when present", () => {
    expect(chomp("hello world", " world")).toBe("hello");
  });
  it("returns the string unchanged when the suffix is absent", () => {
    expect(chomp("hello", "x")).toBe("hello");
  });
  it("with separator '\\n', also eats a preceding CR (Ruby quirk)", () => {
    expect(chomp("hello\r\n", "\n")).toBe("hello");
    expect(chomp("hello\n", "\n")).toBe("hello");
    expect(chomp("hello\r", "\n")).toBe("hello");
    expect(chomp("hello\ry", "\n")).toBe("hello\ry");
  });
  it("with an empty separator, removes all trailing newline characters", () => {
    expect(chomp("hello\r\n\r\n", "")).toBe("hello");
    expect(chomp("hello\n\n\n", "")).toBe("hello");
  });
});
