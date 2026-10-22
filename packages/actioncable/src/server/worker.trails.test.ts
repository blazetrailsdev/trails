import { afterEach, describe, expect, it } from "vitest";
import { ActionCable } from "../namespaces.js";
import { Worker } from "./worker.js";
import "../index.js";

const tick = () => new Promise((r) => setTimeout(r, 5));

function quietConnection(name: string) {
  return { name, logger: { tag: <T>(_l: unknown, block: () => T) => block() } };
}

describe("ActionCable::Server::Worker", () => {
  const errors: unknown[] = [];
  const original = ActionCable._server;
  afterEach(() => {
    ActionCable._server = original;
    errors.length = 0;
  });

  it("keeps connection set until an async block finishes", async () => {
    const worker = new Worker();
    const conn = quietConnection("a");
    let seen: unknown = null;
    const done = worker.work(conn, async () => {
      await tick();
      seen = worker.connection;
    });
    await done;
    expect(seen).toBe(conn);
    expect(worker.connection).toBeNull();
  });

  it("gives overlapping async_invokes their own connection", async () => {
    const worker = new Worker();
    const seen: Record<string, unknown> = {};
    const receiver = {
      async act(name: string) {
        await tick();
        seen[name] = worker.connection;
      },
    };
    const a = quietConnection("a");
    const b = quietConnection("b");
    worker.asyncInvoke(receiver, "act", "a", { connection: a });
    worker.asyncInvoke(receiver, "act", "b", { connection: b });
    await tick();
    await tick();
    await tick();
    expect(seen).toEqual({ a, b });
  });

  it("async_exec runs the block with the receiver as self", async () => {
    const worker = new Worker();
    const receiver = { hit: 0 };
    worker.asyncExec(
      receiver,
      { connection: quietConnection("a") },
      function (this: { hit: number }) {
        this.hit++;
      },
    );
    await tick();
    expect(receiver.hit).toBe(1);
  });

  it("logs and calls handle_exception when invoke raises", async () => {
    ActionCable._server = { logger: { error: (m: unknown) => errors.push(m) } };
    const worker = new Worker();
    let handled = 0;
    const receiver = {
      boom() {
        throw new Error("nope");
      },
      handleException() {
        handled++;
      },
    };
    await worker.invoke(receiver, "boom", { connection: quietConnection("a") });
    expect(errors[0]).toBe("There was an exception - Error(nope)");
    expect(errors).toHaveLength(2);
    expect(handled).toBe(1);
  });

  it("halt makes stopping? true while work runs", () => {
    const worker = new Worker();
    expect(worker.isStopping()).toBe(false);
    worker.asyncInvoke({ wait: () => tick() }, "wait", { connection: quietConnection("a") });
    worker.halt();
    expect(worker.isStopping()).toBe(true);
  });
});

describe("ActionCable::Server::Worker kwargs", () => {
  it("raises missing keyword without connection:", () => {
    const worker = new Worker();
    expect(() => worker.invoke({ run() {} }, "run")).toThrow("missing keyword: :connection");
    expect(() => worker.asyncExec({}, () => {})).toThrow("missing keyword: :connection");
  });
});
