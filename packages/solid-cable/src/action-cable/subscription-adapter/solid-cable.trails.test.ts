import { describe, expect, it } from "vitest";
import { Listener } from "./solid-cable.js";

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
