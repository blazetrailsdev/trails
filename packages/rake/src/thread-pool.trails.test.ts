import { describe, expect, it } from "vitest";
import { block } from "@blazetrails/ruby-compat";
import { ThreadPool } from "./thread-pool.js";

describe("Rake::ThreadPool (trails)", () => {
  it("records history keyed on the worker, with main for a chore run from value", async () => {
    const pool = new ThreadPool(0);
    pool.gatherHistory();
    await pool.future(block(() => 1)).value();
    expect(pool.history().find((e) => e.event === "did_execute")!.thread).toBe("main");

    const threaded = new ThreadPool(1);
    threaded.gatherHistory();
    threaded.future(block(() => 1));
    await threaded.join();
    const history = threaded.history();
    expect(history.find((e) => e.event === "queued")!.thread).toBe("main");
    expect(history.find((e) => e.event === "did_execute")!.thread).toBe(
      history.find((e) => e.event === "spawned")!.data!.new_thread,
    );
  });
});
