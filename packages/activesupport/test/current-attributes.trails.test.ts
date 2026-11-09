import { describe, it, expect } from "vitest";
import { CurrentAttributes } from "../lib/current-attributes.js";

describe("CurrentAttributes (trails)", () => {
  class Current extends CurrentAttributes {
    static {
      this.attribute("world");
    }
  }

  it("protocol probes on the class are not forwarded to the instance", async () => {
    expect((CurrentAttributes as unknown as { then?: unknown }).then).toBeUndefined();
    expect((Current as unknown as { then?: unknown }).then).toBeUndefined();
    expect(await Current).toBe(Current);
    expect(Current).toBe(Current);
  });
});
