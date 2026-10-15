import { describe, it, beforeEach } from "vitest";
import { Concurrent, Thread } from "@blazetrails/ruby-compat";
import { assert } from "../testing/assertions.js";
import { ShareLock } from "./share-lock.js";

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
});
