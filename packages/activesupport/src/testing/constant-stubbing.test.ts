import { describe, it, expect } from "vitest";
import { stubConst } from "./constant-stubbing.js";

describe("stubConst", () => {
  it("keeps the stub until an async block settles", async () => {
    const mod: Record<string, unknown> = { CONSTANT: 1 };
    const seen = await stubConst(mod, "CONSTANT", 2, async () => {
      await Promise.resolve();
      return mod.CONSTANT;
    });
    expect(seen).toBe(2);
    expect(mod.CONSTANT).toBe(1);
  });

  it("keeps a new constant until an async block settles with exists: false", async () => {
    const mod: Record<string, unknown> = {};
    await expect(
      stubConst(
        mod,
        "NEW",
        3,
        async () => {
          await Promise.resolve();
          if (mod.NEW !== 3) throw new Error("stub removed early");
        },
        { exists: false },
      ),
    ).resolves.toBeUndefined();
    expect("NEW" in mod).toBe(false);
  });
});
