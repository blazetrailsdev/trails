import { describe, expect, it } from "vitest";
import { StandardError, block } from "@blazetrails/ruby-compat";
import { ThreadPool } from "./thread-pool.js";

const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

describe("TestRakeTestThreadPool", () => {
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
    const repeat = 5;
    let count = 0;
    const each = (fn: () => void) => {
      for (let i = 0; i < repeat; i++) pool.future(block(fn));
    };
    each(() => each(() => each(() => void (count += 1))));
    await pool.join();
    expect(count).toBe(repeat ** 3);
    expect(pool.statistics().maxActiveThreads).toBe(2);
  });

  it("exceptions", async () => {
    class CustomError extends StandardError {}
    const pool = new ThreadPool(10);
    const deepExceptionBlock = block(async (count: number): Promise<unknown> => {
      if (count < 1) throw new CustomError();
      return pool.future(count - 1, deepExceptionBlock);
    });
    await expect(pool.future(2, deepExceptionBlock)).rejects.toThrow(CustomError);
    await pool.join();
  });

  it("pool reports correct results", async () => {
    const pool = new ThreadPool(7);
    const [a, b, c] = [18, 5, 3];
    const results = await Promise.all(
      Array.from({ length: a }, () =>
        pool.future<number>(
          block(async () => {
            const inner = Array.from({ length: b }, () =>
              pool.future<number>(
                block(async () => {
                  await sleep(Math.random() * 0.001);
                  return c;
                }),
              ),
            );
            return (await Promise.all(inner)).reduce((m, f) => m + f, 0);
          }),
        ),
      ),
    );
    expect(results.reduce((m, f) => m + f, 0)).toBe(a * b * c);
    await pool.join();
  });
});
