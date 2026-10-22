import { describe, expect, it } from "vitest";
import { ArgumentError, Mutex, rbModConstSet } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { QueueAdapters } from "./namespaces.js";
import { AsyncAdapter } from "./queue-adapters/async-adapter.js";
import "./test-helpers/helper.js";

class StubOneAdapter {
  enqueue(..._args: unknown[]): void {}
  enqueueAt(..._args: unknown[]): void {}
}
rbModConstSet(QueueAdapters, "StubOneAdapter", StubOneAdapter);

class StubTwoAdapter {
  enqueue(..._args: unknown[]): void {}
  enqueueAt(..._args: unknown[]): void {}
}
rbModConstSet(QueueAdapters, "StubTwoAdapter", StubTwoAdapter);

describe("QueueAdapterTest", () => {
  it("should forbid nonsense arguments", () => {
    expect(() => Base.setQueueAdapter(Mutex)).toThrow(ArgumentError);
    expect(() => Base.setQueueAdapter(new Mutex())).toThrow(ArgumentError);
  });

  it("should allow overriding the queue_adapter at the child class level without affecting the parent or its sibling", () => {
    const baseQueueAdapter = Base.queueAdapter;

    const childJobOne = class extends Base {};
    expect(childJobOne.queueAdapterName).toBe(Base.queueAdapterName);

    childJobOne.setQueueAdapter("stub_one");

    expect(childJobOne.queueAdapter).not.toBe(Base.queueAdapter);
    expect(childJobOne.queueAdapterName).toBe("stub_one");
    expect(childJobOne.queueAdapter).toBeInstanceOf(StubOneAdapter);
    expect(new childJobOne().queueAdapter).toBeInstanceOf(StubOneAdapter);

    const childJobTwo = class extends Base {};
    childJobTwo.setQueueAdapter("stub_two");

    expect(childJobTwo.queueAdapterName).toBe("stub_two");

    expect(childJobTwo.queueAdapter).toBeInstanceOf(StubTwoAdapter);
    expect(new childJobTwo().queueAdapter).toBeInstanceOf(StubTwoAdapter);
    expect(childJobOne.queueAdapter).toBeInstanceOf(StubOneAdapter);
    expect(Base.queueAdapter).toBe(baseQueueAdapter);

    const childJobThree = class extends Base {};

    expect(childJobThree.queueAdapter).toBe(baseQueueAdapter);
  });

  it("should default to :async adapter if no adapters are set at all", () => {
    const queueAdapterWas = Base._queueAdapter;
    const queueAdapterNameWas = Base._queueAdapterName;
    Base._queueAdapter = Base._queueAdapterName = null;
    try {
      expect(Base.queueAdapterName).toBe("async");
      expect(Base.queueAdapter).toBeInstanceOf(AsyncAdapter);
    } finally {
      Base._queueAdapter = queueAdapterWas;
      Base._queueAdapterName = queueAdapterNameWas;
    }
  });

  it("should extract a reasonable name from a class instance", () => {
    const childJob = class extends Base {};
    childJob.setQueueAdapter(new StubOneAdapter());
    expect(childJob.queueAdapterName).toBe("stub_one");
  });

  class StubThreeAdapter {
    static enqueue(..._args: unknown[]): void {}
    static enqueueAt(..._args: unknown[]): void {}
  }

  it("should extract a reasonable name from a class or module", () => {
    const childJob = class extends Base {};
    childJob.setQueueAdapter(StubThreeAdapter);
    expect(childJob.queueAdapterName).toBe("stub_three");
  });

  class StubFourAdapter {
    enqueue(..._args: unknown[]): void {}
    enqueueAt(..._args: unknown[]): void {}
    get queueAdapterName(): string {
      return "fancy_name";
    }
  }

  it("should use the name provided by the adapter", () => {
    const childJob = class extends Base {};
    childJob.setQueueAdapter(new StubFourAdapter());
    expect(childJob.queueAdapterName).toBe("fancy_name");
  });
});
