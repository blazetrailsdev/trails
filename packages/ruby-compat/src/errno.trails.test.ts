import { describe, expect, it } from "vitest";
import { Errno, SystemCallError } from "./errno.js";

describe("SystemCallError", () => {
  it("is the class of an fs error carrying a code", () => {
    const error = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    expect(error instanceof SystemCallError).toBe(true);
    expect(error instanceof Errno.ENOTTY).toBe(false);
  });

  it("is not the class of a value that is not an fs error", () => {
    expect(new Error("boom") instanceof SystemCallError).toBe(false);
    expect(({ code: "EACCES" } as unknown) instanceof SystemCallError).toBe(false);
    const coded = Object.assign(new Error("boom"), { code: "ERR_INVALID_ARG_TYPE" });
    expect(coded instanceof SystemCallError).toBe(false);
    expect(Object.assign(new Error("boom"), { code: "23505" }) instanceof SystemCallError).toBe(
      false,
    );
    expect((null as unknown) instanceof SystemCallError).toBe(false);
  });

  it("is the class of its own subclasses", () => {
    expect(new Errno.ENOTTY() instanceof SystemCallError).toBe(true);
    expect(new Errno.ENOTTY() instanceof Errno.ENOTTY).toBe(true);
  });

  it("is the class of an fs error carrying its own code", () => {
    const exists = Object.assign(new Error("EEXIST: file already exists"), { code: "EEXIST" });
    const isDir = Object.assign(new Error("EISDIR: illegal operation"), { code: "EISDIR" });
    expect(exists instanceof Errno.EEXIST).toBe(true);
    expect(exists instanceof Errno.EISDIR).toBe(false);
    expect(isDir instanceof Errno.EISDIR).toBe(true);
    expect(new Errno.EISDIR("doc").message).toBe("Is a directory - doc");
    expect(new Errno.EEXIST().errno).toBe(17);
  });
});
