import { describe, expect, it } from "vitest";
import { Monitor, newCond } from "./monitor.js";
import { Thread } from "./thread.js";

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

describe("Monitor#new_cond", () => {
  it("gives a synchronize block's hold up for the wait, to another thread's synchronize", async () => {
    const monitor = new Monitor();
    const cond = newCond.call(monitor);
    const log: string[] = [];
    let ready = false;

    const waiter = new Thread(() =>
      monitor.synchronize(async () => {
        log.push("waiter:enter");
        await cond.waitWhile(() => !ready);
        log.push("waiter:woken");
      }),
    );
    await Thread.pass();

    await new Thread(() =>
      monitor.synchronize(() => {
        log.push("signaller:enter");
        ready = true;
        cond.broadcast();
        log.push("signaller:exit");
      }),
    ).join();
    await waiter.join();

    expect(log).toEqual(["waiter:enter", "signaller:enter", "signaller:exit", "waiter:woken"]);
  });

  it("gives up every nested hold of the waiting thread", async () => {
    const monitor = new Monitor();
    const cond = newCond.call(monitor);
    let ready = false;

    const waiter = new Thread(() =>
      monitor.synchronize(() =>
        monitor.synchronize(async () => {
          await cond.waitWhile(() => !ready);
          return monitor.isMonOwned();
        }),
      ),
    );
    await Thread.pass();

    await new Thread(() =>
      monitor.synchronize(() => {
        ready = true;
        cond.broadcast();
      }),
    ).join();

    expect(await waiter.value()).toBe(true);
  });
});

describe("Monitor#new_cond with a sibling queued under the waiter", () => {
  it("restores the waiter's holds before the sibling is served", async () => {
    const monitor = new Monitor();
    const cond = newCond.call(monitor);
    const log: string[] = [];
    let ready = false;

    const waiter = new Thread(() =>
      monitor.synchronize(() =>
        Promise.all([
          monitor.synchronize(async () => {
            log.push("inner:enter");
            await Thread.pass();
            await cond.waitWhile(() => !ready);
            log.push("inner:exit");
          }),
          monitor.synchronize(() => {
            log.push("sibling");
          }),
        ]),
      ),
    );
    await Thread.pass();

    await new Thread(() =>
      monitor.synchronize(() => {
        log.push("signaller");
        ready = true;
        cond.broadcast();
      }),
    ).join();
    await waiter.join();

    expect(log).toEqual(["inner:enter", "signaller", "inner:exit", "sibling"]);
  });
});

describe("Monitor#synchronize after the holder's block returns", () => {
  it("still serves a queued sibling re-entry", async () => {
    const monitor = new Monitor();
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => (releaseFirst = resolve));
    const served: string[] = [];
    let children!: Promise<unknown>;

    await monitor.synchronize(() => {
      children = Promise.all([
        monitor.synchronize(async () => {
          await first;
          served.push("first");
        }),
        monitor.synchronize(() => {
          served.push("second");
        }),
      ]);
    });
    releaseFirst();
    await children;

    expect(served).toEqual(["first", "second"]);
  });
});
