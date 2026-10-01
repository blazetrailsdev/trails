import { describe, it, expect } from "vitest";
import { Thread, ThreadError } from "@blazetrails/ruby-compat";
import { ThreadLoadInterlockAwareMonitor } from "./load-interlock-aware-monitor.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("ThreadLoadInterlockAwareMonitor", () => {
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
      await monitor.synchronize(() => {
        log.push("owner:nested");
      });
      log.push("owner:exit");
    });
    await other;

    expect(log).toEqual(["owner:nested", "owner:exit", "other"]);
  });

  it("raises when a thread that is not the owner exits", async () => {
    const monitor = new ThreadLoadInterlockAwareMonitor();
    const exit = () => (monitor as unknown as { monExit(): void }).monExit();

    await monitor.synchronize(async () => {
      await new Thread(async () => {
        expect(exit).toThrow(ThreadError);
        expect(exit).toThrow("current thread not owner");
      }).value();
    });
  });
});
