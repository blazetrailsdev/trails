import { afterEach, describe, expect, it, vi } from "vitest";
import { warn } from "./kernel-warn.js";
import { stderr } from "./process-adapter.js";

describe("Kernel#warn", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes nothing for a disabled category and raises for an unknown one", () => {
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    warn("old", { category: ":deprecated" });
    expect(write).not.toHaveBeenCalled();
    warn("new", { category: ":experimental" });
    expect(write).toHaveBeenCalledWith("new\n");
    expect(() => warn("x", { category: ":nope" })).toThrow("unknown category: :nope");
  });

  it("prefixes the caller's location for uplevel and raises for a negative level", () => {
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    warn("here", { uplevel: 0 });
    expect(write).toHaveBeenCalledWith(
      expect.stringMatching(/kernel-warn\.trails\.test\.ts:\d+: warning: here\n$/),
    );
    const caller = (): void => warn("up", { uplevel: 1 });
    caller();
    expect(write).toHaveBeenLastCalledWith(
      expect.stringMatching(/kernel-warn\.trails\.test\.ts:\d+: warning: up\n$/),
    );
    const line = Number(/:(\d+): warning: up/.exec(write.mock.lastCall![0])![1]);
    expect(line).toBe(Number(/:(\d+):\d+\)?$/.exec(new Error().stack!.split("\n")[1])![1]) - 5);
    warn("far", { uplevel: 1000 });
    expect(write).toHaveBeenLastCalledWith("warning: far\n");
    expect(() => warn("x", { uplevel: -1 })).toThrow("negative level (-1)");
  });
});
