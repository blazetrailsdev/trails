import { describe, it, expect } from "vitest";
import { Fiber, Thread } from "@blazetrails/ruby-compat";
import { ThreadLoadInterlockAwareMonitor } from "./load-interlock-aware-monitor.js";

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

  it("raises as MRI does when the last exit runs in another fiber of the owner", async () => {
    const monitor = new ThreadLoadInterlockAwareMonitor();
    const fiber = new Fiber(() => monitor.synchronize(() => Fiber.yield()));

    await monitor.synchronize(() => fiber.resume());

    await expect(fiber.resume()).rejects.toThrow(
      "Attempt to unlock a mutex which is locked by another thread/fiber",
    );
  });
});
