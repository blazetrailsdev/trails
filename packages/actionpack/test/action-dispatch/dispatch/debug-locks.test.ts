import { describe, it } from "vitest";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { Dependencies } from "@blazetrails/activesupport";
import { assertMatch } from "@blazetrails/activesupport/testing/assertions";
import { Concurrent, Thread } from "@blazetrails/ruby-compat";
import { DebugLocks } from "../../../lib/action-dispatch/middleware/debug-locks.js";

const okApp = async (_env: RackEnv): Promise<RackResponse> => [200, {}, ["ok"]];

describe("DebugLocksTest", () => {
  it("render threads status", async () => {
    const app = new DebugLocks(okApp);
    const threadReady = new Concurrent.CountDownLatch();
    const testTerminated = new Concurrent.CountDownLatch();

    const thread = new Thread(() =>
      Dependencies.interlock.running(async () => {
        threadReady.countDown();
        await testTerminated.wait();
      }),
    );
    try {
      await threadReady.wait();

      const response = await app.call({ REQUEST_METHOD: "GET", PATH_INFO: "/trails/locks" });

      testTerminated.countDown();

      assertMatch(/Thread.*?Sharing/, [...(response[2] as Iterable<string>)].join(""));
    } finally {
      await thread.join();
    }
  });
});
