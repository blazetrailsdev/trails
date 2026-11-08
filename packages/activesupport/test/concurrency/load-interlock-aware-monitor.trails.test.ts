import { describe, it, expect } from "vitest";
import { Fiber, Thread } from "@blazetrails/ruby-compat";
import { ThreadLoadInterlockAwareMonitor } from "../../lib/concurrency/load-interlock-aware-monitor.js";
import { Dependencies } from "../../lib/dependencies.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("ThreadLoadInterlockAwareMonitor", () => {
  it("runs an uncontended block before synchronize returns", () => {
    const monitor = new ThreadLoadInterlockAwareMonitor();
    let ran = false;
    void monitor.synchronize(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it("serializes sibling promises of one thread", async () => {
    const monitor = new ThreadLoadInterlockAwareMonitor();
    const log: string[] = [];
    const section = (name: string) =>
      monitor.synchronize(async () => {
        log.push(`${name}:enter`);
        await tick();
        log.push(`${name}:exit`);
      });

    await Promise.all([section("a"), section("b")]);
    await monitor.synchronize(() => Promise.all([section("c"), section("d")]));

    expect(log.join(" ")).toBe("a:enter a:exit b:enter b:exit c:enter c:exit d:enter d:exit");
  });

  it("blocks another thread until the owner exits", async () => {
    const monitor = new ThreadLoadInterlockAwareMonitor();
    const log: string[] = [];
    let other!: Promise<void>;

    await monitor.synchronize(async () => {
      other = new Thread(() =>
        monitor.synchronize(() => {
          log.push("other");
        }),
      ).value();
      await tick();
      await monitor.synchronize(() => log.push("owner:nested"));
    });
    await other;

    expect(log).toEqual(["owner:nested", "other"]);
  });

  it("is owned by the fiber, so a second fiber of the thread waits for the owner", async () => {
    const monitor = new ThreadLoadInterlockAwareMonitor();
    const events: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const owner = monitor.synchronize(async () => {
      events.push("owner in");
      await held;
      events.push("owner out");
    });
    const waiter = new Fiber(() => monitor.synchronize(() => events.push("fiber in"))).resume();
    await tick();
    expect(events).toEqual(["owner in"]);
    release();
    await Promise.all([owner, waiter]);
    expect(events).toEqual(["owner in", "owner out", "fiber in"]);
  });
});

describe("ThreadLoadInterlockAwareMonitor and the interlock", () => {
  it("restores a running thread's share once a contended monEnter returns", async () => {
    const monitor = new ThreadLoadInterlockAwareMonitor();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const owner = new Thread(() => monitor.synchronize(() => held));
    await tick();

    const waiter = new Thread(() =>
      Dependencies.interlock.running(async () => {
        await monitor.synchronize(() => {});
        return Dependencies.interlock.rawState((data) => data.get(Thread.current())?.sharing);
      }),
    );
    await tick();
    release();

    expect(await waiter.value()).toBe(1);
    await owner.join();
  });
});
