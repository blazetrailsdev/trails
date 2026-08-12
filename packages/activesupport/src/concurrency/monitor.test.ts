import { describe, it, expect } from "vitest";
import { synchronize } from "./monitor.js";

class Monitored {
  synchronize = synchronize;
}

describe("MonitorMixin", () => {
  it("returns the block value", async () => {
    const host = new Monitored();
    await expect(host.synchronize(() => 42)).resolves.toBe(42);
  });

  it("serializes concurrent critical sections", async () => {
    const host = new Monitored();
    const log: string[] = [];
    const section = (name: string) =>
      host.synchronize(async () => {
        log.push(`${name}:enter`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        log.push(`${name}:exit`);
      });

    await Promise.all([section("a"), section("b"), section("c")]);

    expect(log).toEqual(["a:enter", "a:exit", "b:enter", "b:exit", "c:enter", "c:exit"]);
  });

  it("is reentrant from inside the critical section", async () => {
    const host = new Monitored();
    await expect(
      host.synchronize(async () => await host.synchronize(async () => "inner")),
    ).resolves.toBe("inner");
  });

  it("releases the lock when the block raises", async () => {
    const host = new Monitored();
    await expect(
      host.synchronize(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(host.synchronize(() => "after")).resolves.toBe("after");
  });

  it("locks each host independently", async () => {
    const a = new Monitored();
    const b = new Monitored();
    let bRan = false;
    await a.synchronize(async () => {
      await b.synchronize(async () => {
        bRan = true;
      });
    });
    expect(bRan).toBe(true);
  });
});
