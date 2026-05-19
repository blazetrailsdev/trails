import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { bodyFromString, bodyToString } from "@blazetrails/rack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { DebugLocks, type InterlockLike, type ThreadLike, type ThreadInfo } from "./debug-locks.js";
import { Response } from "../http/response.js";

const passthrough = async (_env: RackEnv): Promise<RackResponse> => [200, {}, bodyFromString("ok")];

function setInterlock(threads: Array<[ThreadLike, ThreadInfo]>): void {
  const map = new Map(threads);
  const interlock: InterlockLike = {
    rawState(block) {
      return block(map);
    },
  };
  DebugLocks.interlock = interlock;
}

function thread(id: number, status: string | null = "run", backtrace: string[] = []): ThreadLike {
  return { id, status, backtrace: () => backtrace };
}

describe("DebugLocks", () => {
  beforeEach(() => {
    setInterlock([]);
  });
  afterEach(() => {
    DebugLocks.interlock = null;
  });

  it("passes non-matching paths to the inner app", async () => {
    const mw = new DebugLocks(passthrough);
    const res = await mw.call({ REQUEST_METHOD: "GET", PATH_INFO: "/other" });
    expect(res[0]).toBe(200);
    expect(await bodyToString(res[2])).toBe("ok");
  });

  it("passes non-GET requests to the inner app", async () => {
    const mw = new DebugLocks(passthrough);
    const res = await mw.call({ REQUEST_METHOD: "POST", PATH_INFO: "/rails/locks" });
    expect(await bodyToString(res[2])).toBe("ok");
  });

  it("renders thread details at /rails/locks", async () => {
    setInterlock([
      [thread(0x1a, "sleep", ["a.rb:1", "b.rb:2"]), { exclusive: true, sharing: 0 }],
      [thread(0x2b, "run"), { exclusive: false, sharing: 2 }],
    ]);
    const mw = new DebugLocks(passthrough);
    const res = await mw.call({ REQUEST_METHOD: "GET", PATH_INFO: "/rails/locks" });
    expect(res[0]).toBe(200);
    expect(res[1]["content-type"]).toBe("text/plain; charset=utf-8");
    const body = await bodyToString(res[2]);
    expect(body).toContain("Thread 0 [0x1a sleep]  Exclusive");
    expect(body).toContain("Thread 1 [0x2b run]  Sharing x2");
    expect(body).toContain("a.rb:1");
  });

  it("strips a trailing slash from the request path", async () => {
    const mw = new DebugLocks(passthrough);
    const res = await mw.call({ REQUEST_METHOD: "GET", PATH_INFO: "/rails/locks/" });
    expect(res[0]).toBe(200);
    expect(res[1]["content-type"]).toBe("text/plain; charset=utf-8");
  });

  it("reports blockers for a start_exclusive sleeper", async () => {
    setInterlock([
      [thread(1), { sleeper: "start_exclusive", sharing: 0, purpose: "load" }],
      [thread(2), { exclusive: true, sharing: 0 }],
    ]);
    const mw = new DebugLocks(passthrough);
    const res = await mw.call({ REQUEST_METHOD: "GET", PATH_INFO: "/rails/locks" });
    const body = await bodyToString(res[2]);
    expect(body).toContain("Waiting in start_exclusive");
    expect(body).toContain("blocked by: 1");
    expect(body).toContain("blocking: 0");
  });

  it("respects a custom path", async () => {
    const mw = new DebugLocks(passthrough, "/admin/locks");
    const res = await mw.call({ REQUEST_METHOD: "GET", PATH_INFO: "/admin/locks" });
    expect(res[0]).toBe(200);
    expect(res[1]["content-type"]).toBe("text/plain; charset=utf-8");
  });

  it("blocks a start_sharing sleeper when blocker holds exclusive", async () => {
    setInterlock([
      [thread(1), { sleeper: "start_sharing", sharing: 0 }],
      [thread(2), { exclusive: true, sharing: 0 }],
    ]);
    const res = await new DebugLocks(passthrough).call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/rails/locks",
    });
    const body = await bodyToString(res[2]);
    expect(body).toMatch(/Thread 0[\s\S]*?blocked by: 1/);
  });

  it("blocks a yield_shares sleeper only on exclusive blockers", async () => {
    setInterlock([
      [thread(1), { sleeper: "yield_shares", sharing: 0 }],
      [thread(2), { sharing: 1 }],
      [thread(3), { exclusive: true, sharing: 0 }],
    ]);
    const res = await new DebugLocks(passthrough).call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/rails/locks",
    });
    const body = await bodyToString(res[2]);
    expect(body).toMatch(/Thread 0[\s\S]*?blocked by: 2\n/);
  });

  it("blocks a stop_exclusive sleeper via compatible/purpose chain", async () => {
    setInterlock([
      [thread(1), { sleeper: "stop_exclusive", sharing: 0, compatible: ["load"] }],
      [thread(2), { sharing: 0, purpose: "load", compatible: ["load"] }],
    ]);
    const res = await new DebugLocks(passthrough).call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/rails/locks",
    });
    const body = await bodyToString(res[2]);
    expect(body).toMatch(/Thread 0[\s\S]*?blocked by: 1/);
  });

  it("renders 'dead' for a thread with falsy status", async () => {
    setInterlock([[{ id: 0x5, status: false, backtrace: () => null }, { sharing: 0 }]]);
    const res = await new DebugLocks(passthrough).call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/rails/locks",
    });
    const body = await bodyToString(res[2]);
    expect(body).toContain("Thread 0 [0x5 dead]");
  });

  it("Content-Type charset follows Response.defaultCharset", async () => {
    setInterlock([[thread(0x1a), { exclusive: false, sharing: 0 }]]);
    const prior = Response.defaultCharset;
    try {
      Response.defaultCharset = "iso-8859-1";
      const res = await new DebugLocks(passthrough).call({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/rails/locks",
      });
      expect(res[1]["content-type"]).toBe("text/plain; charset=iso-8859-1");
    } finally {
      Response.defaultCharset = prior;
    }
  });

  it("DebugLocks.defaultCharset setter writes through to Response.defaultCharset", () => {
    const prior = Response.defaultCharset;
    try {
      DebugLocks.defaultCharset = "us-ascii";
      expect(Response.defaultCharset).toBe("us-ascii");
      expect(DebugLocks.defaultCharset).toBe("us-ascii");
    } finally {
      Response.defaultCharset = prior;
    }
  });

  it("throws when no interlock is configured", async () => {
    DebugLocks.interlock = null;
    const mw = new DebugLocks(passthrough);
    await expect(mw.call({ REQUEST_METHOD: "GET", PATH_INFO: "/rails/locks" })).rejects.toThrow(
      /interlock is not configured/,
    );
  });
});
