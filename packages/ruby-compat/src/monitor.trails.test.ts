import { describe, expect, it } from "vitest";
import { Monitor } from "./monitor.js";

describe("Monitor#mon_owned?", () => {
  it("is true only inside the owning synchronize", async () => {
    const monitor = new Monitor();
    expect(monitor.isMonOwned()).toBe(false);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const inside = monitor.synchronize(async () => {
      expect(monitor.isMonOwned()).toBe(true);
      await gate;
      return monitor.isMonOwned();
    });
    await Promise.resolve();
    expect(monitor.isMonOwned()).toBe(false);
    release();
    expect(await inside).toBe(true);
  });
});
