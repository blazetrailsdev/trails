import { describe, it, beforeEach } from "vitest";
import { Concurrent, Thread } from "@blazetrails/ruby-compat";
import {
  LoadInterlockAwareMonitor,
  ThreadLoadInterlockAwareMonitor,
} from "../../lib/concurrency/load-interlock-aware-monitor.js";
import { Dependencies } from "../../lib/dependencies.js";
import { assert } from "../../lib/testing/assertions.js";

describe("LoadInterlockAwareMonitorTest", () => {
  let monitor: LoadInterlockAwareMonitor;

  beforeEach(() => {
    monitor = new LoadInterlockAwareMonitor();
  });

  it("entering with no blocking", async () => {
    assert(await (monitor as unknown as { monEnter(): unknown }).monEnter());
  });

  it("entering with blocking", async () => {
    const loadInterlockLatch = new Concurrent.CountDownLatch();
    const monitorLatch = new Concurrent.CountDownLatch();

    let ableToUseMonitor = false;
    let ableToLoad = false;

    const threadWithLoadInterlock = new Thread(() =>
      Dependencies.interlock.running(async () => {
        loadInterlockLatch.countDown();
        await monitorLatch.wait();

        await monitor.synchronize(() => {
          ableToUseMonitor = true;
        });
      }),
    );

    const threadWithMonitorLock = new Thread(() =>
      monitor.synchronize(async () => {
        monitorLatch.countDown();
        await loadInterlockLatch.wait();

        await Dependencies.interlock.loading(() => {
          ableToLoad = true;
        });
      }),
    );

    await threadWithLoadInterlock.join();
    await threadWithMonitorLock.join();

    assert(ableToUseMonitor);
    assert(ableToLoad);
  });
});

describe("ThreadLoadInterlockAwareMonitorTest", () => {
  let monitor: ThreadLoadInterlockAwareMonitor;

  beforeEach(() => {
    monitor = new ThreadLoadInterlockAwareMonitor();
  });

  it("entering with no blocking", async () => {
    assert(await (monitor as unknown as { monEnter(): unknown }).monEnter());
  });

  it("entering with blocking", async () => {
    const loadInterlockLatch = new Concurrent.CountDownLatch();
    const monitorLatch = new Concurrent.CountDownLatch();

    let ableToUseMonitor = false;
    let ableToLoad = false;

    const threadWithLoadInterlock = new Thread(() =>
      Dependencies.interlock.running(async () => {
        loadInterlockLatch.countDown();
        await monitorLatch.wait();

        await monitor.synchronize(() => {
          ableToUseMonitor = true;
        });
      }),
    );

    const threadWithMonitorLock = new Thread(() =>
      monitor.synchronize(async () => {
        monitorLatch.countDown();
        await loadInterlockLatch.wait();

        await Dependencies.interlock.loading(() => {
          ableToLoad = true;
        });
      }),
    );

    await threadWithLoadInterlock.join();
    await threadWithMonitorLock.join();

    assert(ableToUseMonitor);
    assert(ableToLoad);
  });

  // PERMANENT-SKIP: packages/activesupport/CLAUDE.md, "A thread-owned lock is owned by the Fiber (`ThreadLoadInterlockAwareMonitor`)"
  it.skip("lock owned by thread");
});
