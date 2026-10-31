import { describe, expect, it } from "vitest";
import { StandardError, block } from "@blazetrails/ruby-compat";
import { ThreadPool } from "./thread-pool.js";

const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

describe("TestRakeTestThreadPool", () => {
  // PERMANENT-SKIP: a future runs on the event loop; there is no Thread.current to compare.
  it.skip("pool executes in current thread for zero threads", () => {});

  // PERMANENT-SKIP: a future runs on the event loop; there is no Thread.current to compare.
  it.skip("pool executes in other thread for pool of size one", () => {});

  // PERMANENT-SKIP: a future runs on the event loop; there is no Thread.current to compare.
  it.skip("pool executes in two other threads for pool of size two", () => {});

  // PERMANENT-SKIP: a future runs on the event loop; there is no Thread.current to compare.
  it.skip("pool creates the correct number of threads", () => {});

  it("pool future does not duplicate arguments", async () => {
    const pool = new ThreadPool(2);
    const obj = {};
    let captured: unknown = null;
    pool.future(
      obj,
      block((v: unknown) => {
        captured = v;
      }),
    );
    await pool.join();
    expect(captured).toBe(obj);
  });

  it("pool join empties queue", async () => {
    const pool = new ThreadPool(2);
    const repeat = 25;
    let count = 0;
    const each = (fn: () => void) => {
      for (let i = 0; i < repeat; i++) pool.future(block(fn));
    };
    each(() => each(() => each(() => void (count += 1))));
    await pool.join();
    expect(count).toBe(repeat ** 3);
    expect(pool._queue.length === 0).toBe(true);
  });

  it("exceptions", async () => {
    class CustomError extends StandardError {}
    const pool = new ThreadPool(10);
    const deepExceptionBlock = block(async (count: number): Promise<unknown> => {
      if (count < 1) throw new CustomError();
      return pool.future(count - 1, deepExceptionBlock).value();
    });
    await expect(pool.future(2, deepExceptionBlock).value()).rejects.toThrow(CustomError);
    await pool.join();
  });

  it("pool prevents deadlock", async () => {
    const pool = new ThreadPool(5);
    const commonDependencyA = pool.future(block(() => sleep(0.2)));
    const futuresA = Array.from({ length: 10 }, () =>
      pool.future(
        block(async () => {
          await commonDependencyA.value();
          await sleep(Math.random() * 0.01);
        }),
      ),
    );
    const commonDependencyB = pool.future(block(() => Promise.all(futuresA.map((f) => f.value()))));
    const futuresB = Array.from({ length: 10 }, () =>
      pool.future(
        block(async () => {
          await commonDependencyB.value();
          await sleep(Math.random() * 0.01);
        }),
      ),
    );
    await Promise.all(futuresB.map((f) => f.value()));
    await pool.join();
  });

  it("pool reports correct results", async () => {
    const pool = new ThreadPool(7);
    const [a, b, c] = [18, 5, 3];
    const results = await Promise.all(
      Array.from({ length: a }, () =>
        pool
          .future<number>(
            block(async () => {
              const inner = Array.from({ length: b }, () =>
                pool.future<number>(
                  block(async () => {
                    await sleep(Math.random() * 0.001);
                    return c;
                  }),
                ),
              );
              return (await Promise.all(inner.map((f) => f.value()))).reduce((m, f) => m + f, 0);
            }),
          )
          .value(),
      ),
    );
    expect(results.reduce((m, f) => m + f, 0)).toBe(a * b * c);
    await pool.join();
  });
});
