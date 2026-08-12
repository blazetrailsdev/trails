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

  it("queues a detached task that outlives the holder that spawned it", async () => {
    const host = new Monitored();
    const log: string[] = [];
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    let detached!: Promise<void>;

    // The detached task inherits the holder's AsyncContext, but the holder has
    // released by the time it runs — so its owner token no longer matches and
    // it must take the lock like any other chain rather than walking in.
    await host.synchronize(async () => {
      detached = (async () => {
        await gate;
        await host.synchronize(() => {
          log.push("detached");
        });
      })();
    });

    const other = host.synchronize(async () => {
      log.push("other:enter");
      openGate();
      await new Promise((resolve) => setTimeout(resolve, 5));
      log.push("other:exit");
    });

    await Promise.all([other, detached]);

    expect(log).toEqual(["other:enter", "other:exit", "detached"]);
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
