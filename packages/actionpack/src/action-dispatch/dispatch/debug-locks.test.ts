import { describe, it } from "vitest";
import { bodyFromString, bodyToString } from "@blazetrails/rack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { assertMatch, Dependencies } from "@blazetrails/activesupport";
import { Concurrent, Thread } from "@blazetrails/ruby-compat";
import { DebugLocks } from "../middleware/debug-locks.js";

const okApp = async (_env: RackEnv): Promise<RackResponse> => [200, {}, bodyFromString("ok")];

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

      const response = await app.call({ REQUEST_METHOD: "GET", PATH_INFO: "/rails/locks" });

      testTerminated.countDown();

      assertMatch(/Thread.*?Sharing/, await bodyToString(response[2]));
    } finally {
      await thread.join();
    }
  });
});
