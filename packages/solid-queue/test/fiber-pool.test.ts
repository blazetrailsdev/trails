import { afterEach, describe, expect, it, vi } from "vitest";
import { IsolatedExecutionState } from "@blazetrails/activesupport";
import { Fiber, Queue, Thread, rbFSleep, rbObjId } from "@blazetrails/ruby-compat";
import { FiberPool, Pool, type ClaimedExecution } from "../lib/index.js";

class Execution {
  constructor(
    readonly started: Queue<boolean> | null,
    readonly results: Queue<[number, number]> | null,
    readonly pause: number | null,
  ) {}

  async perform(): Promise<void> {
    if (this.started) this.started.push(true);
    if (this.pause) await rbFSleep(this.pause);
    if (this.results) this.results.push([rbObjId(Thread.current()), rbObjId(Fiber.current())]);
  }
}

async function withExecutionIsolation(level: "thread" | "fiber", block: () => Promise<void>) {
  const previousLevel = IsolatedExecutionState.isolationLevel;
  IsolatedExecutionState.isolationLevel = level;
  try {
    await block();
  } finally {
    if (previousLevel != null) IsolatedExecutionState.isolationLevel = previousLevel;
  }
}

function timeout<T>(seconds: number, promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    rbFSleep(seconds).then(() => {
      throw new Error("execution expired");
    }),
  ]);
}

const asExecution = (execution: Execution) => execution as unknown as ClaimedExecution;

describe("FiberPoolTest", () => {
  let pool: FiberPool | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    pool?.shutdown();
    await pool?.waitForTermination(1);
    pool = null;
  });

  it("builds a fiber pool", () => {
    const built = Pool.build({ type: "fiber", size: 5 });

    expect(built).toBeInstanceOf(FiberPool);
    expect(built.size).toBe(5);
  });

  it("executes jobs as fibers on a single reactor thread", async () => {
    await withExecutionIsolation("fiber", async () => {
      pool = new FiberPool(2);
      const results = new Queue<[number, number]>();

      await pool.post(asExecution(new Execution(null, results, 0.05)));
      await pool.post(asExecution(new Execution(null, results, 0.05)));

      const entries = [await timeout(1, results.pop()), await timeout(1, results.pop())];

      expect(new Set(entries.map((e) => e[0])).size).toBe(1);
      expect(new Set(entries.map((e) => e[1])).size).toBe(2);
      expect(await pool.availableCapacity()).toBe(2);
    });
  });

  it("waits for in-flight executions during shutdown", async () => {
    await withExecutionIsolation("fiber", async () => {
      pool = new FiberPool(1);
      const started = new Queue<boolean>();

      await pool.post(asExecution(new Execution(started, null, 0.1)));
      await timeout(1, started.pop());

      pool.shutdown();

      expect(await pool.waitForTermination(0.01)).toBeNull();
      expect(await pool.waitForTermination(1)).toBeTruthy();
    });
  });

  it("shutdown wakes the reactor when idle", async () => {
    await withExecutionIsolation("fiber", async () => {
      pool = new FiberPool(1);
      const results = new Queue<[number, number]>();

      await pool.post(asExecution(new Execution(null, results, null)));
      await timeout(1, results.pop());

      pool.shutdown();

      expect(await pool.waitForTermination(1)).toBeTruthy();
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (`fork`).
  it.skip("starts the reactor lazily so the pool can be built before forking", () => {});

  // PERMANENT-SKIP: packages/solid-queue/CLAUDE.md, "`FiberPool` inlines the `async` gem".
  it.skip("marks the pool as fatal when an execution is cancelled", () => {});
});
