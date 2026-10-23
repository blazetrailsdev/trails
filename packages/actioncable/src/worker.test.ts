import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { Logger } from "@blazetrails/activesupport";
import { Worker } from "./server/worker.js";
import { TaggedLoggerProxy } from "./connection/tagged-logger-proxy.js";

class Receiver {
  lastAction: unknown = null;

  run() {
    this.lastAction = "run";
  }

  process(message: unknown) {
    this.lastAction = ["process", message];
  }

  get connection() {
    return this;
  }

  get logger() {
    const innerLogger = new Logger({ write: () => {}, close: () => {} } as never);
    innerLogger.level = Logger.UNKNOWN;
    return new TaggedLoggerProxy(innerLogger, { tags: [] });
  }
}

describe("WorkerTest", () => {
  let worker: Worker;
  let receiver: Receiver;

  beforeEach(() => {
    worker = new Worker();
    receiver = new Receiver();
  });

  afterEach(() => {
    receiver.lastAction = null;
  });

  it("invoke", async () => {
    await worker.invoke(receiver, "run", { connection: receiver.connection });
    expect(receiver.lastAction).toBe("run");
  });

  it("invoke with arguments", async () => {
    await worker.invoke(receiver, "process", "Hello", { connection: receiver.connection });
    expect(receiver.lastAction).toEqual(["process", "Hello"]);
  });
});
