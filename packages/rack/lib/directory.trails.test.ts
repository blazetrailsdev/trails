import { it, expect, vi, afterEach } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import { Directory } from "./directory.js";

function throwing(code: string): Error & { code: string } {
  return Object.assign(new Error(`${code} - /path`), { code });
}

afterEach(() => vi.restoreAllMocks());

it("stat answers nil for ENOENT and ELOOP", () => {
  const app = new Directory("/");
  for (const code of ["ENOENT", "ELOOP"]) {
    vi.spyOn(File, "stat").mockImplementation(() => {
      throw throwing(code);
    });
    expect(app.stat("/path")).toBeNull();
  }
});

it("stat re-raises an errno that is neither ENOENT nor ELOOP", () => {
  const app = new Directory("/");
  const error = throwing("EACCES");
  vi.spyOn(File, "stat").mockImplementation(() => {
    throw error;
  });

  expect(() => app.stat("/path")).toThrow(error);
});
