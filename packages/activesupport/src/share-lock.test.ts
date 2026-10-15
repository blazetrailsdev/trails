import { describe, it, beforeEach, afterEach } from "vitest";
import { Concurrent, Mutex, Thread } from "@blazetrails/ruby-compat";
import { assert, Assertion, assertEmpty, assertEqual, assertRaises } from "./testing/assertions.js";
import { ShareLock } from "./concurrency/share-lock.js";

const SUFFICIENT_TIMEOUT = 0.2;

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function assertThreadsStuckButReleasableByLatch(
  threads: Thread | Thread[],
  latch: InstanceType<typeof Concurrent.CountDownLatch>,
): Promise<void> {
  await assertThreadsStuck(threads);
  latch.countDown();
  await assertThreadsNotStuck(threads);
}

async function assertThreadsStuck(threads: Thread | Thread[]): Promise<void> {
  await sleep(SUFFICIENT_TIMEOUT);
  const joined = await Promise.all([threads].flat().map((t) => t.join(0.001)));
  assert(joined.every((t) => t == null));
}

async function assertThreadsNotStuck(threads: Thread | Thread[]): Promise<void> {
  const joined = await Promise.all([threads].flat().map((t) => t.join(SUFFICIENT_TIMEOUT)));
  assert(joined.every((t) => t != null));
}

function permutation<T>(array: T[]): T[][] {
  if (array.length <= 1) return [array.slice()];
  return array.flatMap((head, i) =>
    permutation([...array.slice(0, i), ...array.slice(i + 1)]).map((rest) => [head, ...rest]),
  );
}

describe("ShareLockTest", () => {
  let lock: ShareLock;

  beforeEach(() => {
    lock = new ShareLock();
  });

  async function withThreadWaitingInLockSection(
    lockSection: "sharing" | "exclusive",
    block: (release: InstanceType<typeof Concurrent.CountDownLatch>) => Promise<void>,
  ): Promise<void> {
    const inSection = new Concurrent.CountDownLatch();
    const sectionRelease = new Concurrent.CountDownLatch();

    const enter = async () => {
      inSection.countDown();
      await sectionRelease.wait();
    };
    const stuckThread = new Thread(() =>
      lockSection === "sharing" ? lock.sharing(enter) : lock.exclusive({}, enter),
    );

    try {
      await inSection.wait();

      await block(sectionRelease);
    } finally {
      sectionRelease.countDown();
      await stuckThread.join();
    }
  }

  it("reentrancy", async () => {
    const thread = new Thread(async () => {
      await lock.sharing(() => lock.sharing(() => {}));
      await lock.exclusive({}, () => lock.exclusive({}, () => {}));
    });
    await assertThreadsNotStuck(thread);
  });

  it("sharing doesnt block", async () => {
    await withThreadWaitingInLockSection("sharing", async () => {
      await assertThreadsNotStuck(new Thread(() => lock.sharing(() => {})));
    });
  });

  it("sharing blocks exclusive", async () => {
    await withThreadWaitingInLockSection("sharing", async (sharingThreadReleaseLatch) => {
      await new Thread(() =>
        lock.exclusive({ noWait: true }, () => assert(false, "Epic Fail!")),
      ).join();
      const exclusiveThread = new Thread(() => lock.exclusive({}, () => {}));
      await assertThreadsStuckButReleasableByLatch(exclusiveThread, sharingThreadReleaseLatch);
    });
  });

  it("exclusive blocks sharing", async () => {
    await withThreadWaitingInLockSection("exclusive", async (exclusiveThreadReleaseLatch) => {
      const sharingThread = new Thread(() => lock.sharing(() => {}));
      await assertThreadsStuckButReleasableByLatch(sharingThread, exclusiveThreadReleaseLatch);
    });
  });

  it("multiple exclusives are able to progress", async () => {
    await withThreadWaitingInLockSection("sharing", async (sharingThreadReleaseLatch) => {
      const exclusiveThreads = [1, 2].map(() => new Thread(() => lock.exclusive({}, () => {})));

      await assertThreadsStuckButReleasableByLatch(exclusiveThreads, sharingThreadReleaseLatch);
    });
  });

  it("sharing is upgradeable to exclusive", async () => {
    const upgradingThread = new Thread(() => lock.sharing(() => lock.exclusive({}, () => {})));
    await assertThreadsNotStuck(upgradingThread);
  });

  it("exclusive upgrade waits for other sharers to leave", async () => {
    await withThreadWaitingInLockSection("sharing", async (sharingThreadReleaseLatch) => {
      const inSharing = new Concurrent.CountDownLatch();

      const upgradingThread = new Thread(() =>
        lock.sharing(async () => {
          inSharing.countDown();
          await lock.exclusive({}, () => {});
        }),
      );

      await inSharing.wait();
      await assertThreadsStuckButReleasableByLatch(upgradingThread, sharingThreadReleaseLatch);
    });
  });
  it("exclusive matching purpose", async () => {
    for (const useUpgrading of [true, false]) {
      await withThreadWaitingInLockSection("sharing", async (sharingThreadReleaseLatch) => {
        const exclusiveThreads = [1, 2].map(
          () =>
            new Thread(() => {
              const block = () =>
                lock.exclusive({ purpose: "load", compatible: ["load", "unload"] }, () => {});
              return useUpgrading ? lock.sharing(block) : block();
            }),
        );

        await assertThreadsStuckButReleasableByLatch(exclusiveThreads, sharingThreadReleaseLatch);
      });
    }
  });

  it.skip("killed thread loses lock", () => {
    // PERMANENT-SKIP: ruby-compat's Thread#kill marks the thread dead but cannot unwind a JS body awaiting a promise, so the killed thread's ensure never runs and its share is never released (thread.ts, Thread#exit).
  });

  it.skip("exclusive conflicting purpose", () => {
    // PERMANENT-SKIP: the use_upgrading pass leaves both conflicting threads holding shares and relies on Thread#kill in its ensure to release them before the next pass; ruby-compat's Thread#kill cannot unwind a JS body (thread.ts, Thread#exit), so the next pass's sharing section never starts.
  });

  it("exclusive ordering", async () => {
    const scratchPad: string[] = [];
    const scratchPadMutex = new Mutex();

    const loadParams: [string, string[]] = ["load", ["load"]];
    const unloadParams: [string, string[]] = ["unload", ["unload", "load"]];

    const allSharing = new Concurrent.CyclicBarrier(4);

    for (const threadParams of permutation([loadParams, loadParams, unloadParams, unloadParams])) {
      await withThreadWaitingInLockSection("sharing", async (sharingThreadReleaseLatch) => {
        const threads = threadParams.map(
          ([purpose, compatible]) =>
            new Thread(() =>
              lock.sharing(async () => {
                await allSharing.wait();
                await lock.exclusive({ purpose: purpose, compatible: compatible }, () =>
                  scratchPadMutex.synchronize(() => scratchPad.push(purpose)),
                );
              }),
            ),
        );

        await sleep(0.01);
        await scratchPadMutex.synchronize(() => assertEmpty(scratchPad));

        sharingThreadReleaseLatch.countDown();

        await assertThreadsNotStuck(threads);
        await scratchPadMutex.synchronize(() => {
          assertEqual(["load", "load", "unload", "unload"], scratchPad);
          scratchPad.length = 0;
        });
      });
    }
  });

  it("new share attempts block on waiting exclusive", async () => {
    await withThreadWaitingInLockSection("sharing", async (sharingThreadReleaseLatch) => {
      const releaseExclusive = new Concurrent.CountDownLatch();

      const waitingExclusive = new Thread(() =>
        lock.sharing(() => lock.exclusive({}, () => releaseExclusive.wait())),
      );
      await assertThreadsStuck(waitingExclusive);

      const lateShareAttempt = new Thread(() => lock.sharing(() => {}));
      await assertThreadsStuck(lateShareAttempt);

      sharingThreadReleaseLatch.countDown();
      await assertThreadsStuck(lateShareAttempt);

      releaseExclusive.countDown();
      await assertThreadsNotStuck(lateShareAttempt);
    });
  });

  it("share remains reentrant ignoring a waiting exclusive", async () => {
    await withThreadWaitingInLockSection("sharing", async () => {
      const ready = new Concurrent.CyclicBarrier(2);
      const attemptReentrancy = new Concurrent.CountDownLatch();

      const sharer = new Thread(() =>
        lock.sharing(async () => {
          await ready.wait();
          await attemptReentrancy.wait();
          await lock.sharing(() => {});
        }),
      );

      const exclusive = new Thread(() =>
        lock.sharing(async () => {
          await ready.wait();
          await lock.exclusive({}, () => {});
        }),
      );

      await assertThreadsStuck(exclusive);

      attemptReentrancy.countDown();

      await assertThreadsNotStuck(sharer);
      await assertThreadsStuck(exclusive);
    });
  });

  it("compatible exclusives cooperate to both proceed", async () => {
    const ready = new Concurrent.CyclicBarrier(2);
    const done = new Concurrent.CyclicBarrier(2);

    const threads = [1, 2].map(
      () =>
        new Thread(() =>
          lock.sharing(async () => {
            await ready.wait();
            await lock.exclusive(
              { purpose: "x", compatible: ["x"], afterCompatible: ["x"] },
              () => {},
            );
            await done.wait();
          }),
        ),
    );

    await assertThreadsNotStuck(threads);
  });

  it("manual yield", async () => {
    const ready = new Concurrent.CyclicBarrier(2);
    const done = new Concurrent.CyclicBarrier(2);

    const threads = [
      new Thread(() =>
        lock.sharing(async () => {
          await ready.wait();
          await lock.exclusive({ purpose: "x" }, () => {});
          await done.wait();
        }),
      ),

      new Thread(() =>
        lock.sharing(async () => {
          await ready.wait();
          await lock.yieldShares({ compatible: ["x"] }, () => done.wait());
        }),
      ),
    ];

    await assertThreadsNotStuck(threads);
  });

  it("manual incompatible yield", async () => {
    const ready = new Concurrent.CyclicBarrier(2);
    const done = new Concurrent.CyclicBarrier(2);
    let threads: Thread[] | undefined;

    try {
      threads = [
        new Thread(() =>
          lock.sharing(async () => {
            await ready.wait();
            await lock.exclusive({ purpose: "x" }, () => {});
            await done.wait();
          }),
        ),

        new Thread(() =>
          lock.sharing(async () => {
            await ready.wait();
            await lock.yieldShares({ compatible: ["y"] }, () => done.wait());
          }),
        ),
      ];

      await assertThreadsStuck(threads);
    } finally {
      if (threads) threads.forEach((t) => t.kill());
    }
  });

  it("manual recursive yield", async () => {
    const ready = new Concurrent.CyclicBarrier(2);
    const done = new Concurrent.CyclicBarrier(2);
    const doNesting = new Concurrent.CountDownLatch();

    const threads = [
      new Thread(() =>
        lock.sharing(async () => {
          await ready.wait();
          await lock.exclusive({ purpose: "x" }, () => {});
          await done.wait();
        }),
      ),

      new Thread(() =>
        lock.sharing(() =>
          lock.yieldShares({ compatible: ["x"] }, () =>
            lock.sharing(async () => {
              await ready.wait();
              await doNesting.wait();
              await lock.yieldShares({ compatible: ["x", "y"] }, () => done.wait());
            }),
          ),
        ),
      ),
    ];

    await assertThreadsStuck(threads);
    doNesting.countDown();

    await assertThreadsNotStuck(threads);
  });

  it("manual recursive yield cannot expand outer compatible", async () => {
    const ready = new Concurrent.CyclicBarrier(2);
    const doCompatibleNesting = new Concurrent.CountDownLatch();
    const inCompatibleNesting = new Concurrent.CountDownLatch();

    const incompatibleThread = new Thread(() =>
      lock.sharing(async () => {
        await ready.wait();
        await lock.exclusive({ purpose: "x" }, () => {});
      }),
    );

    const yieldSharesThread = new Thread(() =>
      lock.sharing(async () => {
        await ready.wait();
        await lock.yieldShares({ compatible: ["y"] }, async () => {
          await doCompatibleNesting.wait();
          await lock.sharing(() =>
            lock.yieldShares({ compatible: ["x", "y"] }, () => inCompatibleNesting.wait()),
          );
        });
      }),
    );

    await assertThreadsStuck(incompatibleThread);
    doCompatibleNesting.countDown();
    await assertThreadsStuck(incompatibleThread);
    inCompatibleNesting.countDown();
    await assertThreadsNotStuck([yieldSharesThread, incompatibleThread]);
  });

  it("manual recursive yield restores previous compatible", async () => {
    const ready = new Concurrent.CyclicBarrier(2);
    const doNesting = new Concurrent.CountDownLatch();
    const afterNesting = new Concurrent.CountDownLatch();

    const incompatibleThread = new Thread(async () => {
      await ready.wait();
      await lock.exclusive({ purpose: "z" }, () => {});
    });

    const recursiveYieldSharesThread = new Thread(() =>
      lock.sharing(async () => {
        await ready.wait();
        await lock.yieldShares({ compatible: ["y"] }, async () => {
          await doNesting.wait();
          await lock.sharing(() => lock.yieldShares({ compatible: ["x", "y"] }, () => {}));
          await afterNesting.wait();
        });
      }),
    );

    await assertThreadsStuck(incompatibleThread);
    doNesting.countDown();
    await assertThreadsStuck(incompatibleThread);

    const compatibleThread = new Thread(() => lock.exclusive({ purpose: "y" }, () => {}));
    await assertThreadsNotStuck(compatibleThread);

    const postNestingIncompatibleThread = new Thread(() =>
      lock.exclusive({ purpose: "x" }, () => {}),
    );
    await assertThreadsStuck(postNestingIncompatibleThread);

    afterNesting.countDown();
    await assertThreadsNotStuck(recursiveYieldSharesThread);
    await assertThreadsNotStuck(postNestingIncompatibleThread);
    await assertThreadsNotStuck(incompatibleThread);
  });

  it("in shared section incompatible non upgrading threads cannot preempt upgrading threads", async () => {
    const scratchPad: string[] = [];
    const scratchPadMutex = new Mutex();

    const upgradingLoadParams: [string, string[], boolean] = ["load", ["load"], true];
    const nonUpgradingUnloadParams: [string, string[], boolean] = [
      "unload",
      ["load", "unload"],
      false,
    ];

    for (const threadParams of permutation([upgradingLoadParams, nonUpgradingUnloadParams])) {
      await withThreadWaitingInLockSection("sharing", async (sharingThreadReleaseLatch) => {
        const threads = threadParams.map(
          ([purpose, compatible, useUpgrading]) =>
            new Thread(() => {
              const block = () =>
                lock.exclusive({ purpose: purpose, compatible: compatible }, () =>
                  scratchPadMutex.synchronize(() => scratchPad.push(purpose)),
                );
              return useUpgrading ? lock.sharing(block) : block();
            }),
        );

        await assertThreadsStuck(threads);
        await scratchPadMutex.synchronize(() => assertEmpty(scratchPad));

        sharingThreadReleaseLatch.countDown();

        await assertThreadsNotStuck(threads);
        await scratchPadMutex.synchronize(() => {
          assertEqual(["load", "unload"], scratchPad);
          scratchPad.length = 0;
        });
      });
    }
  });
});

describe("CustomAssertionsTest", () => {
  let latch: InstanceType<typeof Concurrent.CountDownLatch>;
  let thread: Thread;

  beforeEach(() => {
    latch = new Concurrent.CountDownLatch();
    thread = new Thread(() => latch.wait());
  });

  afterEach(async () => {
    latch.countDown();
    await thread.join();
  });

  it("happy path", async () => {
    await assertThreadsStuckButReleasableByLatch(thread, latch);
  });

  it("detects stuck thread", async () => {
    await assertRaises([Assertion], {}, () => assertThreadsNotStuck(thread));
  });

  it("detects free thread", async () => {
    latch.countDown();
    await assertRaises([Assertion], {}, () => assertThreadsStuck(thread));
  });

  it("detects already released", async () => {
    latch.countDown();
    await assertRaises([Assertion], {}, () =>
      assertThreadsStuckButReleasableByLatch(thread, latch),
    );
  });

  it("detects remains latched", async () => {
    const anotherLatch = new Concurrent.CountDownLatch();
    await assertRaises([Assertion], {}, () =>
      assertThreadsStuckButReleasableByLatch(thread, anotherLatch),
    );
  });
});
