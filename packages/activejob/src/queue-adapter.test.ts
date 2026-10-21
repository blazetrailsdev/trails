import { describe, expect, it } from "vitest";
import { ArgumentError, Mutex, rbModConstSet } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { QueueAdapters } from "./namespaces.js";

class StubOneAdapter {
  enqueue(..._args: unknown[]): void {}
  enqueueAt(..._args: unknown[]): void {}
}
rbModConstSet(QueueAdapters, "StubOneAdapter", StubOneAdapter);

describe("QueueAdapterTest", () => {
  it("should forbid nonsense arguments", () => {
    expect(() => Base.setQueueAdapter(Mutex)).toThrow(ArgumentError);
    expect(() => Base.setQueueAdapter(new Mutex())).toThrow(ArgumentError);
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
