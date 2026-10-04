import { describe, expect, it } from "vitest";
import { Errno, SystemCallError } from "./errno.js";

describe("SystemCallError", () => {
  it("is the class of an fs error carrying a code", () => {
    const error = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    expect(error instanceof SystemCallError).toBe(true);
    expect(error instanceof Errno.ENOTTY).toBe(false);
  });

  it("is not the class of an error with no code", () => {
    expect(new Error("boom") instanceof SystemCallError).toBe(false);
    expect((null as unknown) instanceof SystemCallError).toBe(false);
  });

  it("is the class of its own subclasses", () => {
    expect(new Errno.ENOTTY() instanceof SystemCallError).toBe(true);
    expect(new Errno.ENOTTY() instanceof Errno.ENOTTY).toBe(true);
  });
});
