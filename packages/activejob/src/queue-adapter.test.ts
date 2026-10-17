import "./test-helpers/helper.js";
import { assertRaises } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import {
  Module,
  registerConstant,
  include,
  Mutex,
  ArgumentError,
  rbEqual,
  rbObjIsKindOf,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { TestHost } from "./codegen-runtime.js";
import { ActiveJob as ActiveJobSeat, QueueAdapters as QueueAdaptersSeat } from "./namespaces.js";
import { AsyncAdapter } from "./queue-adapters/async-adapter.js";
import { TestHelper } from "./test-helper.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

export const ActiveJob: any = ActiveJobSeat;
registerConstant("ActiveJob", ActiveJob);
export const ActiveJobQueueAdapters: any = new Module();
registerConstant("ActiveJob::QueueAdapters", ActiveJobQueueAdapters);
export class StubOneAdapter {
  [key: string]: any;
  static [key: string]: any;

  enqueue(...rest: any[]): any {}

  enqueueAt(...rest: any[]): any {}
}
registerConstant("ActiveJob::QueueAdapters::StubOneAdapter", StubOneAdapter);
export class StubTwoAdapter {
  [key: string]: any;
  static [key: string]: any;

  enqueue(...rest: any[]): any {}

  enqueueAt(...rest: any[]): any {}
}
registerConstant("ActiveJob::QueueAdapters::StubTwoAdapter", StubTwoAdapter);
describe("QueueAdapterTest", () => {
  class QueueAdapterTest extends TestHost {}
  registerConstant("QueueAdapterTest", QueueAdapterTest);
  include(QueueAdapterTest, TestHelper);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it("should forbid nonsense arguments", async ({ testCase }: any) => {
    await assertRaises([ArgumentError], {}, () => {
      Base.setQueueAdapter(Mutex);
      return Mutex;
    });
    await assertRaises([ArgumentError], {}, () => {
      Base.setQueueAdapter(new Mutex());
      return new Mutex();
    });
  });
  it("should allow overriding the queue_adapter at the child class level without affecting the parent or its sibling", async ({
    testCase,
  }: any) => {
    await Base.disableTestAdapter();
    const baseQueueAdapter: any = await Base.queueAdapter();
    const childJobOne: any = class extends Base {
      static [key: string]: any;
      [key: string]: any;
    };
    expect(await Base.queueAdapterName()).toEqual(await childJobOne.queueAdapterName());
    childJobOne.setQueueAdapter("stub_one");
    expect(rbEqual(await childJobOne.queueAdapter(), await Base.queueAdapter())).toBe(false);
    expect(await childJobOne.queueAdapterName()).toEqual("stub_one");
    expect(rbObjIsKindOf(await childJobOne.queueAdapter(), StubOneAdapter)).toBe(true);
    expect(rbObjIsKindOf(await new childJobOne().queueAdapter(), StubOneAdapter)).toBe(true);
    const childJobTwo: any = class extends Base {
      static [key: string]: any;
      [key: string]: any;
    };
    childJobTwo.setQueueAdapter("stub_two");
    expect(await childJobTwo.queueAdapterName()).toEqual("stub_two");
    expect(rbObjIsKindOf(await childJobTwo.queueAdapter(), StubTwoAdapter)).toBe(true);
    expect(rbObjIsKindOf(await new childJobTwo().queueAdapter(), StubTwoAdapter)).toBe(true);
    expect(rbObjIsKindOf(await childJobOne.queueAdapter(), StubOneAdapter)).toBe(true);
    expect(await Base.queueAdapter()).toEqual(baseQueueAdapter);
    const childJobThree: any = class extends Base {
      static [key: string]: any;
      [key: string]: any;
    };
    expect(await childJobThree.queueAdapter()).toEqual(baseQueueAdapter);
  });
  it("should default to :async adapter if no adapters are set at all", async ({
    testCase,
  }: any) => {
    let _queueAdapterWas: any, _queueAdapterNameWas: any;
    try {
      await Base.disableTestAdapter();
      _queueAdapterWas = await Base._queueAdapter;
      _queueAdapterNameWas = await Base._queueAdapterName;
      Base._queueAdapter = await (Base._queueAdapterName = null);
      expect(await Base.queueAdapterName()).toEqual("async");
      expect(rbObjIsKindOf(await Base.queueAdapter(), AsyncAdapter)).toBe(true);
    } finally {
      Base._queueAdapter = _queueAdapterWas;
      Base._queueAdapterName = _queueAdapterNameWas;
    }
  });
  it("should extract a reasonable name from a class instance", async ({ testCase }: any) => {
    const childJob: any = class extends Base {
      static [key: string]: any;
      [key: string]: any;
    };
    childJob.setQueueAdapter(new StubOneAdapter());
    expect(await childJob.queueAdapterName()).toEqual("stub_one");
  });
  it("should extract a reasonable name from a class or module", async ({ testCase }: any) => {
    const childJob: any = class extends Base {
      static [key: string]: any;
      [key: string]: any;
    };
    childJob.setQueueAdapter(StubThreeAdapter);
    expect(await childJob.queueAdapterName()).toEqual("stub_three");
  });
  it("should use the name provided by the adapter", async ({ testCase }: any) => {
    const childJob: any = class extends Base {
      static [key: string]: any;
      [key: string]: any;
    };
    childJob.setQueueAdapter(new StubFourAdapter());
    expect(await childJob.queueAdapterName()).toEqual("fancy_name");
  });
});
export function enqueue(...rest: any[]): any {}

export function enqueueAt(...rest: any[]): any {}

export const StubThreeAdapter: any = new Module();
Object.assign(StubThreeAdapter, { enqueue, enqueueAt });
registerConstant("QueueAdapterTest::StubThreeAdapter", StubThreeAdapter);
export class StubFourAdapter {
  [key: string]: any;
  static [key: string]: any;

  enqueue(...rest: any[]): any {}

  enqueueAt(...rest: any[]): any {}

  queueAdapterName(): any {
    return "fancy_name";
  }
}
registerConstant("QueueAdapterTest::StubFourAdapter", StubFourAdapter);
rbModConstSet(ActiveJobSeat, "QueueAdapters", ActiveJobQueueAdapters);
rbModConstSet(QueueAdaptersSeat, "StubOneAdapter", StubOneAdapter);
rbModConstSet(QueueAdaptersSeat, "StubTwoAdapter", StubTwoAdapter);
