import { describe, expect, it } from "vitest";
import { Concurrent, Thread, rbFSleep } from "@blazetrails/ruby-compat";
import { Listener } from "../../../lib/action-cable/subscription-adapter/solid-cable.js";

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
  it("shutdown during interruptible raises Stop in the listener thread", async () => {
    const l = Object.create(Listener.prototype) as {
      _critical: InstanceType<typeof Concurrent.Semaphore>;
      _thread: Thread<Promise<void>>;
      interruptible<T>(block: () => Promise<T>): Promise<T>;
      shutdown(): Promise<void>;
    };
    l._critical = new Concurrent.Semaphore(0);
    let stopped = false;
    l._thread = new Thread(async () => {
      try {
        for (;;) await l.interruptible(() => rbFSleep(10));
      } catch (error) {
        stopped = error instanceof Listener.Stop;
      } finally {
        l._critical.release();
      }
    });
    await Thread.pass();
    const start = Date.now();
    await l.shutdown();
    expect(stopped).toBe(true);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(l._critical.availablePermits()).toBe(1);
  });
});
