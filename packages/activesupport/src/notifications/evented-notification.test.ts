import { describe, expect, it } from "vitest";
import { Fanout, InstrumentationSubscriberError } from "./fanout.js";
import { assertRaises } from "../testing/assertions.js";

class BadListenerException extends Error {}

class Listener {
  events: [string, string, unknown, Record<string, unknown>][] = [];

  start(name: string, id: unknown, payload: Record<string, unknown>): void {
    this.events.push(["start", name, id, payload]);
  }

  finish(name: string, id: unknown, payload: Record<string, unknown>): void {
    this.events.push(["finish", name, id, payload]);
  }
}

class ListenerWithTimedSupport extends Listener {
  call(
    name: string,
    _start: unknown,
    _finish: unknown,
    id: unknown,
    payload: Record<string, unknown>,
  ): void {
    this.events.push(["call", name, id, payload]);
  }
}

class BadStartListener {
  start(_name: string, _id: unknown, _payload: Record<string, unknown>): void {
    throw new BadListenerException();
  }
  finish(_name: string, _id: unknown, _payload: Record<string, unknown>): void {}
}

class BadFinishListener {
  start(_name: string, _id: unknown, _payload: Record<string, unknown>): void {}
  finish(_name: string, _id: unknown, _payload: Record<string, unknown>): void {
    throw new BadListenerException();
  }
}

describe("EventedTest", () => {
  it("evented listener", () => {
    const notifier = new Fanout();
    const listener = new Listener();
    notifier.subscribe("hi", listener);
    notifier.start("hi", 1, {});
    notifier.start("hi", 2, {});
    notifier.finish("hi", 2, {});
    notifier.finish("hi", 1, {});

    expect(listener.events.length).toEqual(4);
    expect(listener.events).toEqual([
      ["start", "hi", 1, {}],
      ["start", "hi", 2, {}],
      ["finish", "hi", 2, {}],
      ["finish", "hi", 1, {}],
    ]);
  });

  it("evented listener no events", () => {
    const notifier = new Fanout();
    const listener = new Listener();
    notifier.subscribe("hi", listener);
    notifier.start("world", 1, {});
    expect(listener.events.length).toEqual(0);
  });

  it("listen to everything", () => {
    const notifier = new Fanout();
    const listener = new Listener();
    notifier.subscribe(null, listener);
    notifier.start("hello", 1, {});
    notifier.start("world", 1, {});
    notifier.finish("world", 1, {});
    notifier.finish("hello", 1, {});

    expect(listener.events.length).toEqual(4);
    expect(listener.events).toEqual([
      ["start", "hello", 1, {}],
      ["start", "world", 1, {}],
      ["finish", "world", 1, {}],
      ["finish", "hello", 1, {}],
    ]);
  });

  it("listen start multiple exception consistency", async () => {
    const notifier = new Fanout();
    const listener = new Listener();
    notifier.subscribe(null, new BadStartListener());
    notifier.subscribe(null, new BadStartListener());
    notifier.subscribe(null, listener);

    let error = await assertRaises([InstrumentationSubscriberError], {}, () =>
      notifier.start("hello", 1, {}),
    );
    expect(error.cause).toBeInstanceOf(BadListenerException);

    error = await assertRaises([InstrumentationSubscriberError], {}, () =>
      notifier.start("world", 1, {}),
    );
    expect(error.cause).toBeInstanceOf(BadListenerException);

    notifier.finish("world", 1, {});
    notifier.finish("hello", 1, {});

    expect(listener.events.length).toEqual(4);
    expect(listener.events).toEqual([
      ["start", "hello", 1, {}],
      ["start", "world", 1, {}],
      ["finish", "world", 1, {}],
      ["finish", "hello", 1, {}],
    ]);
  });

  it("listen finish multiple exception consistency", async () => {
    const notifier = new Fanout();
    const listener = new Listener();
    notifier.subscribe(null, new BadFinishListener());
    notifier.subscribe(null, new BadFinishListener());
    notifier.subscribe(null, (name: string, _s: unknown, _f: unknown, _id: unknown) => {
      throw new Error("foo");
    });
    notifier.subscribe(null, () => {
      throw new Error("foo");
    });
    notifier.subscribe(
      null,
      () => {
        throw new Error("foo");
      },
      true,
    );
    notifier.subscribe(null, listener);

    notifier.start("hello", 1, {});
    notifier.start("world", 1, {});

    let error = (await assertRaises([InstrumentationSubscriberError], {}, () =>
      notifier.finish("world", 1, {}),
    )) as InstrumentationSubscriberError;
    expect(error.exceptions.length).toEqual(5);
    expect(error.cause).toBeInstanceOf(BadListenerException);

    error = (await assertRaises([InstrumentationSubscriberError], {}, () =>
      notifier.finish("hello", 1, {}),
    )) as InstrumentationSubscriberError;
    expect(error.exceptions.length).toEqual(5);
    expect(error.cause).toBeInstanceOf(BadListenerException);

    expect(listener.events.length).toEqual(4);

    expect(listener.events).toEqual([
      ["start", "hello", 1, {}],
      ["start", "world", 1, {}],
      ["finish", "world", 1, {}],
      ["finish", "hello", 1, {}],
    ]);
  });

  it("evented listener priority", () => {
    const notifier = new Fanout();
    const listener = new ListenerWithTimedSupport();
    notifier.subscribe("hi", listener);

    notifier.start("hi", 1, {});
    notifier.finish("hi", 1, {});

    expect(listener.events).toEqual([
      ["start", "hi", 1, {}],
      ["finish", "hi", 1, {}],
    ]);
  });

  it("listen to regexp", () => {
    const notifier = new Fanout();
    const listener = new Listener();
    notifier.subscribe(/[a-z]*.world/, listener);
    notifier.start("hi.world", 1, {});
    notifier.finish("hi.world", 2, {});
    notifier.start("hello.world", 1, {});
    notifier.finish("hello.world", 2, {});

    expect(listener.events).toEqual([
      ["start", "hi.world", 1, {}],
      ["finish", "hi.world", 2, {}],
      ["start", "hello.world", 1, {}],
      ["finish", "hello.world", 2, {}],
    ]);
  });

  it("listen to regexp with exclusions", () => {
    const notifier = new Fanout();
    const listener = new Listener();
    notifier.subscribe(/[a-z]*.world/, listener);
    notifier.unsubscribe("hi.world");
    notifier.start("hi.world", 1, {});
    notifier.finish("hi.world", 2, {});
    notifier.start("hello.world", 1, {});
    notifier.finish("hello.world", 2, {});

    expect(listener.events).toEqual([
      ["start", "hello.world", 1, {}],
      ["finish", "hello.world", 2, {}],
    ]);
  });
});
