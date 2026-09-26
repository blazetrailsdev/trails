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

describe("Monitor#synchronize", () => {
  it("re-enters at once from a call nested in the holder's own block", async () => {
    const monitor = new Monitor();
    const result = await monitor.synchronize(() =>
      monitor.synchronize(() => monitor.synchronize(() => "nested")),
    );
    expect(result).toBe("nested");
  });

  it("takes turns between sibling re-entries started under one holder", async () => {
    const monitor = new Monitor();
    let inside = 0;
    const served: number[] = [];
    await monitor.synchronize(() =>
      Promise.all(
        Array.from({ length: 10 }, (_unused, i) =>
          monitor.synchronize(async () => {
            inside += 1;
            expect(inside).toBe(1);
            served.push(i);
            await new Promise((resolve) => setTimeout(resolve, 0));
            await monitor.synchronize(() => undefined);
            inside -= 1;
          }),
        ),
      ),
    );
    expect(served).toEqual(Array.from({ length: 10 }, (_unused, i) => i));
  });
});
