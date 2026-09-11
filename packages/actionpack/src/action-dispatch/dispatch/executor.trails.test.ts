import { describe, it, expect } from "vitest";
import { IsolatedExecutionState } from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { Executor, type ExecutorLike } from "../middleware/executor.js";

const executor: ExecutorLike = {
  runBang: () => ({ completeBang: () => {} }),
  errorReporter: () => ({ report: () => {} }),
};

describe("Executor execution context", () => {
  it("gives each concurrent request its own execution context", async () => {
    const seen: Array<{ readonly id: number }> = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const app: RackApp = async () => {
      seen.push(IsolatedExecutionState.context());
      await gate;
      seen.push(IsolatedExecutionState.context());
      return [200, {}, []] as unknown as RackResponse;
    };
    const mw = new Executor(app, executor);
    const p1 = mw.call({} as RackEnv);
    const p2 = mw.call({} as RackEnv);
    release();
    await Promise.all([p1, p2]);

    const [a, b, a2, b2] = seen;
    expect(a).not.toBe(b);
    expect(a2).toBe(a);
    expect(b2).toBe(b);
    expect(a.id).not.toBe(0);
    expect(IsolatedExecutionState.context().id).toBe(0);
  });

  it("runs completeBang in the request's execution context", async () => {
    let requestContext: { readonly id: number } | undefined;
    let completeContext: { readonly id: number } | undefined;
    const mw = new Executor(
      async () => {
        requestContext = IsolatedExecutionState.context();
        return [200, {}, []] as unknown as RackResponse;
      },
      {
        ...executor,
        runBang: () => ({
          completeBang: () => void (completeContext = IsolatedExecutionState.context()),
        }),
      },
    );
    const [, , body] = await mw.call({} as RackEnv);
    (body as unknown as { close(): void }).close();
    expect(completeContext).toBe(requestContext);
  });
});
