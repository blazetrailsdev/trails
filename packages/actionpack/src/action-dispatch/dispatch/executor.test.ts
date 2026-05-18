import { describe, it, expect } from "vitest";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { Executor, type ExecutorLike, type ExecutorState } from "../middleware/executor.js";

class StubExecutor implements ExecutorLike {
  runHooks: Array<() => void> = [];
  completeHooks: Array<() => void> = [];
  reports: Array<{ error: unknown; handled: boolean; source: string }> = [];

  toRun(fn: () => void) {
    this.runHooks.push(fn);
  }
  toComplete(fn: () => void) {
    this.completeHooks.push(fn);
  }

  runBang(_opts?: { reset?: boolean }): ExecutorState {
    for (const h of this.runHooks) h();
    return { completeBang: () => this.completeHooks.forEach((h) => h()) };
  }

  errorReporter = {
    report: (error: unknown, opts: { handled: boolean; source: string }) => {
      this.reports.push({ error, ...opts });
    },
  };
}

async function callAndReturnBody(
  executor: StubExecutor,
  app?: RackApp,
): Promise<{ body: any; status: number }> {
  const innerApp: RackApp = app ?? (async () => [200, {}, []] as unknown as RackResponse);
  const mw = new Executor(innerApp, executor);
  const [status, , body] = await mw.call({} as RackEnv);
  return { body, status };
}

describe("ExecutorTest", () => {
  it("returned body object always responds to close", async () => {
    const { body } = await callAndReturnBody(new StubExecutor());
    expect(typeof body.close).toBe("function");
  });

  it("returned body object always responds to close even if called twice", async () => {
    const ex = new StubExecutor();
    const r1 = await callAndReturnBody(ex);
    r1.body.close();
    const r2 = await callAndReturnBody(ex);
    r2.body.close();
    expect(typeof r2.body.close).toBe("function");
  });

  it("it calls close on underlying object when close is called on body", async () => {
    let closeCalled = false;
    const innerBody = {
      close: () => {
        closeCalled = true;
      },
    };
    const { body } = await callAndReturnBody(
      new StubExecutor(),
      async () => [200, { "content-type": "text/html" }, innerBody] as unknown as RackResponse,
    );
    body.close();
    expect(closeCalled).toBe(true);
  });

  it("run callbacks are called before close", async () => {
    const ex = new StubExecutor();
    let running = false;
    ex.toRun(() => {
      running = true;
    });
    const { body } = await callAndReturnBody(ex);
    expect(running).toBe(true);
    body.close();
  });

  it("complete callbacks are called on close", async () => {
    const ex = new StubExecutor();
    let completed = false;
    ex.toComplete(() => {
      completed = true;
    });
    const { body } = await callAndReturnBody(ex);
    expect(completed).toBe(false);
    body.close();
    expect(completed).toBe(true);
  });

  it("complete callbacks are called on exceptions", async () => {
    const ex = new StubExecutor();
    let completed = false;
    ex.toComplete(() => {
      completed = true;
    });
    await expect(
      callAndReturnBody(ex, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(completed).toBe(true);
  });

  it("body abandoned", async () => {
    const ex = new StubExecutor();
    let ran = 0;
    let completed = 0;
    ex.toRun(() => {
      ran += 1;
    });
    ex.toComplete(() => {
      completed += 1;
    });
    const mw = new Executor(async () => [200, {}, []] as unknown as RackResponse, ex);
    const requests = 5;
    for (let i = 0; i < requests; i++) await mw.call({} as RackEnv);
    expect(ran).toBe(requests);
    // Bodies never closed → complete callbacks never run.
    expect(completed).toBe(0);
  });

  it("error reporting", async () => {
    const ex = new StubExecutor();
    const err = new Error("boom");
    await expect(
      callAndReturnBody(ex, async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    expect(ex.reports).toHaveLength(1);
    expect(ex.reports[0].error).toBe(err);
    expect(ex.reports[0].handled).toBe(false);
    expect(ex.reports[0].source).toBe("application.action_dispatch");
  });
});
