import { beforeAll, describe, expect, it } from "vitest";
import type { StreamEventLoop } from "@blazetrails/actioncable/connection/stream-event-loop";
import { Concurrent, Thread, rbFSleep } from "@blazetrails/ruby-compat";
import { Listener } from "../../../lib/action-cable/subscription-adapter/solid-cable.js";
import { loadCableSchema } from "../../support/cable-schema.js";
import { useDummyApplication } from "../../support/config-stubs.js";

interface SelfPipeListener {
  wakeUp(): void;
  interruptibleSleep(time: number): Promise<void>;
  selfPipe: {
    reader: { readNonblock(len: number, buf: null, opts: { exception: boolean }): unknown };
  };
}

function listener(): SelfPipeListener {
  return Object.create(Listener.prototype) as SelfPipeListener;
}

describe("Listener self-pipe", () => {
  it("interruptibleSleep returns after the timeout with nothing written", async () => {
    const l = listener();
    const start = Date.now();
    await l.interruptibleSleep(0.05);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it("wakeUp wakes interruptibleSleep and the pipe is drained", async () => {
    const l = listener();
    l.wakeUp();
    l.wakeUp();
    const start = Date.now();
    await l.interruptibleSleep(5);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(l.selfPipe.reader.readNonblock(11, null, { exception: false })).toBe("wait_readable");
  });

  it("interruptibleSleep skips the wait when time is not positive", async () => {
    const l = listener();
    l.wakeUp();
    await l.interruptibleSleep(0);
    expect(l.selfPipe.reader.readNonblock(11, null, { exception: false })).toEqual(
      new Uint8Array([46]),
    );
  });
});

describe("Listener shutdown", () => {
  useDummyApplication();

  beforeAll(async () => {
    await loadCableSchema();
  });

  it("shutdown during interruptible raises Stop in the listener thread", async () => {
    const eventLoop = { post: () => null } as unknown as StreamEventLoop;
    const l = new Listener(eventLoop);
    const thread = (l as unknown as { thread: Thread }).thread;
    const critical = (l as unknown as { _critical: InstanceType<typeof Concurrent.Semaphore> })
      ._critical;
    await rbFSleep(0.2);
    const start = Date.now();
    await l.shutdown();
    expect(thread.isAlive()).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(critical.availablePermits()).toBe(1);
  });
});
