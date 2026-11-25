import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __INTERNAL_resetProcessAdapter_TEST_ONLY,
  getProcessAdapter,
  processAdapterConfig,
  runtime,
} from "../lib/process-adapter.js";

const realProcess = globalThis.process;

function stubVersions(versions: Record<string, string>): void {
  vi.stubGlobal(
    "process",
    new Proxy(realProcess, {
      get: (target, key) => (key === "versions" ? versions : Reflect.get(target, key, target)),
    }),
  );
  __INTERNAL_resetProcessAdapter_TEST_ONLY();
}

describe("runtime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __INTERNAL_resetProcessAdapter_TEST_ONLY();
  });

  it("answers node without process.versions.bun", () => {
    stubVersions({ node: "26.0.0" });
    expect(runtime()).toBe("node");
    expect(processAdapterConfig.adapter).toBe(null);
    expect(getProcessAdapter().registerHooks).toBeTypeOf("function");
    expect(processAdapterConfig.adapter).toBe("node");
  });

  it("selects the Bun adapter when process.versions.bun is set", () => {
    stubVersions({ node: "24.3.0", bun: "1.3.6" });
    expect(runtime()).toBe("bun");
    const adapter = getProcessAdapter();
    expect(processAdapterConfig.adapter).toBe("bun");
    expect(adapter.registerHooks).toBeUndefined();
    expect(adapter.cwd()).toBe(realProcess.cwd());
    expect(adapter.pid()).toBe(realProcess.pid);
  });
});
