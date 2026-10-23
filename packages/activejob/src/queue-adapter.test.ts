import type {} from "@blazetrails/vitest-matchers";
import "./test-helpers/helper.js";
import { assertRaises } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import {
  registerConstant,
  include,
  Mutex,
  ArgumentError,
  classModule,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { AsyncAdapter } from "./queue-adapters/async-adapter.js";
import { TestCase } from "./test-case.js";
import { TestHelper } from "./test-helper.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

export const ActiveJobQueueAdapters = {};
export class StubOneAdapter {
  static toString(): string {
    return "ActiveJob::QueueAdapters::StubOneAdapter";
  }

  enqueue(...rest: unknown[]) {}

  enqueueAt(...rest: unknown[]) {}
}
registerConstant("ActiveJob::QueueAdapters::StubOneAdapter", StubOneAdapter);
export class StubTwoAdapter {
  static toString(): string {
    return "ActiveJob::QueueAdapters::StubTwoAdapter";
  }

  enqueue(...rest: unknown[]) {}

  enqueueAt(...rest: unknown[]) {}
}
registerConstant("ActiveJob::QueueAdapters::StubTwoAdapter", StubTwoAdapter);
class QueueAdapterTest extends TestCase {}
registerConstant("QueueAdapterTest", QueueAdapterTest);
include(QueueAdapterTest, TestHelper);

describe("QueueAdapterTest", () => {
  beforeEach<{ testCase: QueueAdapterTest }>(async ({ testCase }) => {
    await testCase.setup();
  });
  afterEach<{ testCase: QueueAdapterTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });
  it<{ testCase: QueueAdapterTest }>("should forbid nonsense arguments", async ({ testCase }) => {
    await assertRaises([ArgumentError], {}, () => {
      Base.setQueueAdapter(Mutex);
      return Mutex;
    });
    await assertRaises([ArgumentError], {}, () => {
      Base.setQueueAdapter(new Mutex());
      return new Mutex();
    });
  });
  it<{
    testCase: QueueAdapterTest;
  }>("should allow overriding the queue_adapter at the child class level without affecting the parent or its sibling", async ({
    testCase,
  }) => {
    Base.disableTestAdapter();
    let baseQueueAdapter = await Base.queueAdapter;
    let childJobOne = class extends Base {};
    expect(await Base.queueAdapterName).toEqualRuby(await childJobOne.queueAdapterName());
    childJobOne.setQueueAdapter("stub_one");
    expect(await childJobOne.queueAdapter()).not.toEqualRuby(await Base.queueAdapter);
    expect(await childJobOne.queueAdapterName()).toEqual("stub_one");
    expect(await childJobOne.queueAdapter()).toBeInstanceOf(StubOneAdapter);
    expect(await new childJobOne().queueAdapter()).toBeInstanceOf(StubOneAdapter);
    let childJobTwo = class extends Base {};
    childJobTwo.setQueueAdapter("stub_two");
    expect(await childJobTwo.queueAdapterName()).toEqual("stub_two");
    expect(await childJobTwo.queueAdapter()).toBeInstanceOf(StubTwoAdapter);
    expect(await new childJobTwo().queueAdapter()).toBeInstanceOf(StubTwoAdapter);
    expect(await childJobOne.queueAdapter()).toBeInstanceOf(StubOneAdapter);
    expect(await Base.queueAdapter).toEqualRuby(baseQueueAdapter);
    let childJobThree = class extends Base {};
    expect(await childJobThree.queueAdapter()).toEqualRuby(baseQueueAdapter);
  });
  it<{
    testCase: QueueAdapterTest;
  }>("should default to :async adapter if no adapters are set at all", async ({ testCase }) => {
    let _queueAdapterWas, _queueAdapterNameWas;
    try {
      Base.disableTestAdapter();
      _queueAdapterWas = await Base._queueAdapter;
      _queueAdapterNameWas = await Base._queueAdapterName;
      Base._queueAdapter = Base._queueAdapterName = null;
      expect(await Base.queueAdapterName).toEqual("async");
      expect(await Base.queueAdapter).toBeInstanceOf(AsyncAdapter);
    } finally {
      Base._queueAdapter = _queueAdapterWas;
      Base._queueAdapterName = _queueAdapterNameWas;
    }
  });
  it<{
    testCase: QueueAdapterTest;
  }>("should extract a reasonable name from a class instance", async ({ testCase }) => {
    let childJob = class extends Base {};
    childJob.setQueueAdapter(new StubOneAdapter());
    expect(await childJob.queueAdapterName()).toEqual("stub_one");
  });
  it<{
    testCase: QueueAdapterTest;
  }>("should extract a reasonable name from a class or module", async ({ testCase }) => {
    let childJob = class extends Base {};
    childJob.setQueueAdapter(StubThreeAdapter);
    expect(await childJob.queueAdapterName()).toEqual("stub_three");
  });
  it<{ testCase: QueueAdapterTest }>("should use the name provided by the adapter", async ({
    testCase,
  }) => {
    let childJob = class extends Base {};
    childJob.setQueueAdapter(new StubFourAdapter());
    expect(await childJob.queueAdapterName()).toEqual("fancy_name");
  });
});
export class StubThreeAdapter {
  static readonly [classModule] = true;

  static toString(): string {
    return "QueueAdapterTest::StubThreeAdapter";
  }

  static enqueue(...rest: unknown[]) {}

  static enqueueAt(...rest: unknown[]) {}
}
registerConstant("QueueAdapterTest::StubThreeAdapter", StubThreeAdapter);
export class StubFourAdapter {
  static toString(): string {
    return "QueueAdapterTest::StubFourAdapter";
  }

  enqueue(...rest: unknown[]) {}

  enqueueAt(...rest: unknown[]) {}

  queueAdapterName() {
    return "fancy_name";
  }
}
registerConstant("QueueAdapterTest::StubFourAdapter", StubFourAdapter);
