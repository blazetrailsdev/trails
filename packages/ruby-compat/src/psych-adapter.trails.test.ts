import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type * as PsychAdapterModule from "./psych-adapter.js";
import type { LoadError as LoadErrorClass } from "./load-error.js";

const nodeProcess = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process;

describe("psych-adapter backend resolution", () => {
  let adapter: typeof PsychAdapterModule;
  let LoadError: typeof LoadErrorClass;

  beforeEach(async () => {
    vi.resetModules();
    adapter = await import("./psych-adapter.js");
    ({ LoadError } = await import("./load-error.js"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("raises LoadError at the call when no backend resolves", () => {
    vi.spyOn(nodeProcess, "getBuiltinModule").mockImplementation(() => {
      throw new Error("no module");
    });
    const call = () => adapter.parse("a: 1");
    expect(call).toThrow(LoadError);
    expect(call).toThrow("cannot load such file -- yaml");
  });

  it("raises LoadError for a configured adapter that is not registered", () => {
    adapter.psychAdapterConfig.adapter = "libyaml";
    expect(() => adapter.stringify(1)).toThrow("cannot load such file -- libyaml");
  });

  it("dispatches to a registered adapter", () => {
    adapter.registerPsychAdapter("fake", {
      parse: (src) => ({ parsed: src }),
      stringify: (value) => `dumped ${String(value)}`,
    });
    adapter.psychAdapterConfig.adapter = "fake";
    expect(adapter.parse("x")).toEqual({ parsed: "x" });
    expect(adapter.stringify(1)).toBe("dumped 1");
  });

  it("loads yaml synchronously under Node", () => {
    expect(adapter.parse("a: 1")).toEqual({ a: 1 });
  });
});
