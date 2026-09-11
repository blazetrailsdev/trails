import { describe, it, expect } from "vitest";
import { Handler, bodyFromString } from "@blazetrails/rack";
import type { RackResponse } from "@blazetrails/rack";
import { Thread } from "@blazetrails/ruby-compat";
import { Executor, type ExecutorLike } from "../middleware/executor.js";

describe("Executor execution context", () => {
  it("runs completeBang in the request's execution context", async () => {
    let requestThread: Thread | undefined;
    let completed!: (thread: Thread) => void;
    const completeThread = new Promise<Thread>((resolve) => (completed = resolve));
    const executor: ExecutorLike = {
      runBang: () => ({ completeBang: () => completed(Thread.current()) }),
      errorReporter: () => ({ report: () => {} }),
    };
    const mw = new Executor(async () => {
      requestThread = Thread.current();
      return [200, {}, bodyFromString("")] as unknown as RackResponse;
    }, executor);

    const server = await Handler.Node.run((env) => mw.call(env), { Port: 0, Host: "127.0.0.1" });
    try {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      await (await fetch(`http://127.0.0.1:${port}/`)).text();

      expect(await completeThread).toBe(requestThread);
      expect(requestThread).not.toBe(Thread.main);
    } finally {
      await Handler.Node.shutdown();
    }
  });
});
