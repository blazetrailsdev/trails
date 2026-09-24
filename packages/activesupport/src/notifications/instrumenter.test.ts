import { beforeEach, describe, expect, it } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Instrumenter } from "./instrumenter.js";
import { assert, assertEmpty, assertRaises, assertNotNil } from "../testing/assertions.js";

class TestNotifier {
  readonly starts: unknown[][] = [];
  readonly finishes: unknown[][] = [];

  start(...args: unknown[]): void {
    this.starts.push(args);
  }

  finish(...args: unknown[]): void {
    this.finishes.push(args);
  }
}

describe("InstrumenterTest", () => {
  let notifier: TestNotifier;
  let instrumenter: Instrumenter;
  let payload: Record<string, unknown>;

  beforeEach(() => {
    notifier = new TestNotifier();
    instrumenter = new Instrumenter(notifier);
    payload = { foo: {} };
  });

  it("instrument", () => {
    let called = false;
    instrumenter.instrument("foo", payload, () => {
      called = true;
    });

    assert(called);
  });

  it("instrument yields the payload for further modification", () => {
    expect(instrumenter.instrument("awesome", {}, (p) => (p.result = 1 + 1))).toEqual(2);
    expect(notifier.finishes.length).toEqual(1);
    const [name, , payload] = notifier.finishes[0];
    expect(name).toEqual("awesome");
    expect(payload).toEqual({ result: 2 });
  });

  it("instrument works without a block", () => {
    instrumenter.instrument("no.block", payload);
    expect(notifier.finishes.length).toEqual(1);
    expect(notifier.finishes[0][0]).toEqual("no.block");
  });

  it("start", () => {
    instrumenter.start("foo", payload);
    expect(notifier.starts).toEqual([["foo", instrumenter.id, payload]]);
    assertEmpty(notifier.finishes);
  });

  it("finish", () => {
    instrumenter.finish("foo", payload);
    expect(notifier.finishes).toEqual([["foo", instrumenter.id, payload]]);
    assertEmpty(notifier.starts);
  });

  it("record", () => {
    let called = false;
    const event = instrumenter.newEvent("foo", payload);
    event.record(() => {
      called = true;
    });

    assert(called);
  });

  it("record yields the payload for further modification", () => {
    const event = instrumenter.newEvent("awesome");
    event.record((p) => (p.result = 1 + 1));
    expect(event.payload.result).toEqual(2);

    expect(event.name).toEqual("awesome");
    expect(event.payload).toEqual({ result: 2 });
    expect(event.transactionId).toEqual(instrumenter.id);
    assertNotNil(event.time);
    assertNotNil(event.end);
  });

  it("record works without a block", () => {
    const event = instrumenter.newEvent("no.block", payload);
    event.record();

    expect(event.name).toEqual("no.block");
    expect(event.payload).toEqual(payload);
    expect(event.transactionId).toEqual(instrumenter.id);
    assertNotNil(event.time);
    assertNotNil(event.end);
  });

  it("record with exception", async () => {
    const event = instrumenter.newEvent("crash", payload);
    await assertRaises([RuntimeError], {}, () => {
      event.record(() => {
        throw new RuntimeError("Oopsies");
      });
    });
    expect((event.payload.exception_object as Error).message).toEqual("Oopsies");
  });
});
