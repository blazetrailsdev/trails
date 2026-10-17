import {
  compact as hashCompact,
  actsLike,
  descendants,
  classAttribute,
  Concern,
  onLoad,
} from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import {
  rtest,
  rbObjAsString,
  rbObjDup,
  rbObjRespondTo,
  rbEqual,
  isEmpty,
  aryJoin,
  drop,
  ArgumentError,
  rbModName,
  fetch,
  rbObjIsProc,
  rbFArray,
  Range,
  hasKey,
  rbFSend,
  Module,
  extend,
  rbModConstSet,
  include,
} from "@blazetrails/ruby-compat";
import { Arguments } from "./arguments.js";
import { Base } from "./base.js";
import * as CodegenRuntime from "./codegen-runtime.js";
import {
  rbEnum,
  rbBinop,
  rbEntries,
  rbAsyncEnum,
  rbAppend,
  rbToF,
  rbDelete,
  rbSingletonPublicMethods,
} from "./codegen-runtime.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";
import { TestAdapter } from "./queue-adapters/test-adapter.js";

export function beforeSetup(this: any): any {
  const queueAdapterSpecificToThisTestClass: any = this.queueAdapterForTest();
  for (const klass of this.queueAdapterChangedJobs()) {
    if (rtest(queueAdapterSpecificToThisTestClass)) {
      klass.enableTestAdapter(queueAdapterSpecificToThisTestClass);
    } else if (klass._queueAdapter == null) {
      klass.enableTestAdapter(new TestAdapter());
    }
  }
  this.clearEnqueuedJobs();
  this.clearPerformedJobs();
  return TestHelper.superMethod(this, "beforeSetup")!();
}

export function afterTeardown(this: any): any {
  TestHelper.superMethod(this, "afterTeardown")!();
  return this.queueAdapterChangedJobs().forEach((klass?: any) => klass.disableTestAdapter());
}

export function queueAdapterForTest(this: any): any {}

export async function assertEnqueuedJobs(
  this: any,
  number: any,
  { only = null, except = null, queue = null }: any = {},
  block?: any,
): Promise<any> {
  let originalJobs: any, newJobs: any, actualCount: any;
  this.requireActiveJobTestAdapterBang("assert_enqueued_jobs");
  if (block != null) {
    originalJobs = await this.enqueuedJobsWith({ only: only, except: except, queue: queue });
    await this._assertNothingRaisedOrWarn("assert_enqueued_jobs", block);
    newJobs = await this.enqueuedJobsWith({ only: only, except: except, queue: queue });
    actualCount = rbBinop(newJobs, "-", originalJobs).length;
  } else {
    actualCount = (await this.enqueuedJobsWith({ only: only, except: except, queue: queue }))
      .length;
  }
  return this.assertEqual(
    number,
    actualCount,
    `${rbObjAsString(number)} jobs expected, but ${actualCount} were enqueued`,
  );
}

export async function assertNoEnqueuedJobs(
  this: any,
  { only = null, except = null, queue = null }: any = {},
  block?: any,
): Promise<any> {
  this.requireActiveJobTestAdapterBang("assert_no_enqueued_jobs");
  return await this.assertEnqueuedJobs(0, { only: only, except: except, queue: queue }, block);
}

export async function assertPerformedJobs(
  this: any,
  number: any,
  { only = null, except = null, queue = null }: any = {},
  block?: any,
): Promise<any> {
  let originalCount: any, newCount: any, performedJobsSize: any;
  this.requireActiveJobTestAdapterBang("assert_performed_jobs");
  if (block != null) {
    originalCount = this.performedJobs.length;
    await this.performEnqueuedJobs({ only: only, except: except, queue: queue }, block);
    newCount = this.performedJobs.length;
    performedJobsSize = newCount - originalCount;
  } else {
    performedJobsSize = (await this.performedJobsWith({ only: only, except: except, queue: queue }))
      .length;
  }
  return this.assertEqual(
    number,
    performedJobsSize,
    `${rbObjAsString(number)} jobs expected, but ${performedJobsSize} were performed`,
  );
}

export async function assertNoPerformedJobs(
  this: any,
  { only = null, except = null, queue = null }: any = {},
  block?: any,
): Promise<any> {
  this.requireActiveJobTestAdapterBang("assert_no_performed_jobs");
  return await this.assertPerformedJobs(0, { only: only, except: except, queue: queue }, block);
}

export async function assertEnqueuedWith(
  this: any,
  { job = null, args = null, at = null, queue = null, priority = null }: any = {},
  block?: any,
): Promise<any> {
  let originalEnqueuedJobs: any, jobs: any;
  this.requireActiveJobTestAdapterBang("assert_enqueued_with");
  const expected: any = hashCompact({
    job: job,
    args: args,
    at: at,
    queue: queue,
    priority: priority,
  });
  const expectedArgs: any = this.prepareArgsForAssertion(expected);
  const potentialMatches: any = [];
  if (block != null) {
    originalEnqueuedJobs = rbObjDup(this.enqueuedJobs);
    await this._assertNothingRaisedOrWarn("assert_enqueued_with", block);
    jobs = rbBinop(this.enqueuedJobs, "-", originalEnqueuedJobs);
  } else {
    jobs = this.enqueuedJobs;
  }
  const matchingJob: any = await rbAsyncEnum(jobs, "find", async (enqueuedJob?: any) => {
    const deserializedJob: any = await this.deserializeArgsForAssertion(enqueuedJob);
    potentialMatches.push(deserializedJob);
    return rbEntries(expectedArgs).every(([key, value]: any) => {
      if (rbObjRespondTo(value, "call")) {
        return value(deserializedJob[key]);
      } else {
        return rbEqual(value, deserializedJob[key]);
      }
    });
  });
  const matchingClass: any = potentialMatches.filter((enqueuedJob?: any) =>
    rbEqual(enqueuedJob["job_class"], rbObjAsString(job)),
  );
  let message: any = `No enqueued job found with ${rbObjAsString(expected)}`;
  if (isEmpty(potentialMatches)) {
    message = rbAppend(message, "\n\nNo jobs were enqueued");
  } else if (isEmpty(matchingClass)) {
    message = rbAppend(
      message,
      `\n\nNo jobs of class ${rbObjAsString(expected["job"])} were enqueued, job classes enqueued: `,
    );
    message = rbAppend(
      message,
      aryJoin(
        potentialMatches.map((job?: any) => job["job_class"]),
        ", ",
      ),
    );
  } else {
    message = rbAppend(
      message,
      `\n\nPotential matches: ${rbObjAsString(aryJoin(matchingClass, "\n"))}`,
    );
  }
  this.assert(matchingJob, message);
  return await this.instantiateJob(matchingJob);
}

export async function assertPerformedWith(
  this: any,
  { job = null, args = null, at = null, queue = null, priority = null }: any = {},
  block?: any,
): Promise<any> {
  let originalPerformedJobsCount: any, jobs: any;
  this.requireActiveJobTestAdapterBang("assert_performed_with");
  const expected: any = hashCompact({
    job: job,
    args: args,
    at: at,
    queue: queue,
    priority: priority,
  });
  const expectedArgs: any = this.prepareArgsForAssertion(expected);
  const potentialMatches: any = [];
  if (block != null) {
    originalPerformedJobsCount = this.performedJobs.length;
    await this.performEnqueuedJobs(undefined, block);
    jobs = drop(this.performedJobs as any[], originalPerformedJobsCount);
  } else {
    jobs = this.performedJobs;
  }
  const matchingJob: any = await rbAsyncEnum(jobs, "find", async (enqueuedJob?: any) => {
    const deserializedJob: any = await this.deserializeArgsForAssertion(enqueuedJob);
    potentialMatches.push(deserializedJob);
    return rbEntries(expectedArgs).every(([key, value]: any) => {
      if (rbObjRespondTo(value, "call")) {
        return value(deserializedJob[key]);
      } else {
        return rbEqual(value, deserializedJob[key]);
      }
    });
  });
  const matchingClass: any = potentialMatches.filter((enqueuedJob?: any) =>
    rbEqual(enqueuedJob["job_class"], rbObjAsString(job)),
  );
  let message: any = `No performed job found with ${rbObjAsString(expected)}`;
  if (isEmpty(potentialMatches)) {
    message = rbAppend(message, "\n\nNo jobs were performed");
  } else if (isEmpty(matchingClass)) {
    message = rbAppend(
      message,
      `\n\nNo jobs of class ${rbObjAsString(expected["job"])} were performed, job classes performed: `,
    );
    message = rbAppend(
      message,
      aryJoin(
        potentialMatches.map((job?: any) => job["job_class"]),
        ", ",
      ),
    );
  } else {
    message = rbAppend(
      message,
      `\n\nPotential matches: ${rbObjAsString(aryJoin(matchingClass, "\n"))}`,
    );
  }
  this.assert(matchingJob, message);
  return await this.instantiateJob(matchingJob);
}

export async function performEnqueuedJobs(
  this: any,
  { only = null, except = null, queue = null, at = null }: any = {},
  block?: any,
): Promise<any> {
  if (!(block != null)) {
    this.requireActiveJobTestAdapterBang("perform_enqueued_jobs (without a block)");
    return await this.flushEnqueuedJobs({ only: only, except: except, queue: queue, at: at });
  }
  if (!this.isUsingTestAdapter()) {
    return await this._assertNothingRaisedOrWarn("perform_enqueued_jobs", block);
  }
  this.validateOption({ only: only, except: except });
  const oldPerformEnqueuedJobs: any = this.queueAdapter().performEnqueuedJobs;
  const oldPerformEnqueuedAtJobs: any = this.queueAdapter().performEnqueuedAtJobs;
  const oldFilter: any = this.queueAdapter().filter;
  const oldReject: any = this.queueAdapter().reject;
  const oldQueue: any = this.queueAdapter().queue;
  const oldAt: any = this.queueAdapter().at;
  try {
    this.queueAdapter().performEnqueuedJobs = true;
    this.queueAdapter().performEnqueuedAtJobs = true;
    this.queueAdapter().filter = only;
    this.queueAdapter().reject = except;
    this.queueAdapter().queue = queue;
    this.queueAdapter().at = at;
    return await await this._assertNothingRaisedOrWarn("perform_enqueued_jobs", block);
  } finally {
    this.queueAdapter().performEnqueuedJobs = oldPerformEnqueuedJobs;
    this.queueAdapter().performEnqueuedAtJobs = oldPerformEnqueuedAtJobs;
    this.queueAdapter().filter = oldFilter;
    this.queueAdapter().reject = oldReject;
    this.queueAdapter().queue = oldQueue;
    this.queueAdapter().at = oldAt;
  }
}

export function queueAdapter(this: any): any {
  return Base.queueAdapter();
}

/** @internal */
export function requireActiveJobTestAdapterBang(this: any, method: any): any {
  if (!this.isUsingTestAdapter()) {
    throw new ArgumentError(
      `${rbObjAsString(method)} requires the Active Job test adapter, you're using ${rbObjAsString(rbModName(this.queueAdapter().constructor))}.`,
    );
  }
  return null;
}

/** @internal */
export function isUsingTestAdapter(this: any): any {
  return this.queueAdapter() instanceof TestAdapter;
}

/** @internal */
export function clearEnqueuedJobs(this: any): any {
  if (this.isUsingTestAdapter()) {
    return CodegenRuntime.clear(this.enqueuedJobs);
  }
  return null;
}

/** @internal */
export function clearPerformedJobs(this: any): any {
  if (this.isUsingTestAdapter()) {
    return CodegenRuntime.clear(this.performedJobs);
  }
  return null;
}

/** @internal */
export async function jobsWith(
  this: any,
  jobs: any,
  { only = null, except = null, queue = null, at = null }: any = {},
  block?: any,
): Promise<any> {
  this.validateOption({ only: only, except: except });
  return await rbAsyncEnum(rbObjDup(jobs), "select", async (job?: any) => {
    const jobClass: any = fetch(job, "job");
    if (rtest(only)) {
      if (!rtest(this.filterAsProc(only)(job))) {
        return false;
      }
    } else if (rtest(except)) {
      if (rtest(this.filterAsProc(except)(job))) {
        return false;
      }
    }
    if (rtest(queue)) {
      if (!rbEqual(rbObjAsString(queue), fetch(job, "queue", jobClass.queueName))) {
        return false;
      }
    }
    if (rtest(at) && rtest(job["at"])) {
      if (rbBinop(job["at"], ">", rbToF(at))) {
        return false;
      }
    }
    if (block != null) {
      await block(job);
    }
    return true;
  });
}

/** @internal */
export function filterAsProc(this: any, filter: any): any {
  if (rbObjIsProc(filter)) {
    return filter;
  }
  return (job?: any) => rbFArray(filter).includes(fetch(job, "job"));
}

/** @internal */
export async function enqueuedJobsWith(
  this: any,
  { only = null, except = null, queue = null, at = null }: any = {},
  block?: any,
): Promise<any> {
  return await this.jobsWith(
    this.enqueuedJobs,
    { only: only, except: except, queue: queue, at: at },
    block,
  );
}

/** @internal */
export async function performedJobsWith(
  this: any,
  { only = null, except = null, queue = null }: any = {},
  block?: any,
): Promise<any> {
  return await this.jobsWith(
    this.performedJobs,
    { only: only, except: except, queue: queue },
    block,
  );
}

/** @internal */
export async function flushEnqueuedJobs(
  this: any,
  { only = null, except = null, queue = null, at = null }: any = {},
): Promise<any> {
  return (
    await this.enqueuedJobsWith(
      { only: only, except: except, queue: queue, at: at },
      async (payload?: any) => {
        rbDelete(this.queueAdapter().enqueuedJobs, payload);
        rbAppend(this.queueAdapter().performedJobs, payload);
        return await (
          await this.instantiateJob(payload, { skipDeserializeArguments: true })
        ).performNow();
      },
    )
  ).length;
}

/** @internal */
export function prepareArgsForAssertion(this: any, args: any): any {
  return ((arguments_: any) => {
    let atRange: any;
    if (typeof arguments_["queue"] === "string") {
      arguments_["queue"] = rbObjAsString(arguments_["queue"]);
    }
    if (actsLike.call(arguments_["at"], "time")) {
      atRange = new Range(
        rbBinop(arguments_["at"], "-", 1),
        rbBinop(arguments_["at"], "+", 1),
        false,
      );
      arguments_["at"] = (at?: any) => atRange.cover(at);
    }
    return arguments_;
  })(rbObjDup(args));
}

/** @internal */
export async function deserializeArgsForAssertion(this: any, job: any): Promise<any> {
  return await (async (newJob: any) => {
    if (rtest(newJob["at"])) {
      newJob["at"] = RubyTime.at(newJob["at"]);
    }
    if (rtest(newJob["args"])) {
      newJob["args"] = await Arguments.deserialize(newJob["args"]);
    }
    return newJob;
  })(rbObjDup(job));
}

/** @internal */
export async function instantiateJob(
  this: any,
  payload: any,
  { skipDeserializeArguments = false }: any = {},
): Promise<any> {
  const job: any = payload["job"].deserialize(payload);
  if (hasKey(payload, "at")) {
    job.scheduledAt = RubyTime.at(payload["at"]);
  }
  if (!rtest(skipDeserializeArguments)) {
    await rbFSend(job, "deserializeArgumentsIfNeeded");
  }
  return job;
}

/** @internal */
export function queueAdapterChangedJobs(this: any): any {
  return rbEnum(rbAppend(descendants(Base), Base)).filter((klass?: any) =>
    rbEnum(rbSingletonPublicMethods(klass)).includes("_queue_adapter"),
  );
}

/** @internal */
export function validateOption(this: any, { only = null, except = null }: any = {}): any {
  if (rtest(only) && rtest(except)) {
    throw new ArgumentError("Cannot specify both `:only` and `:except` options.");
  }
  return null;
}

export const TestHelper: any = new Module((mod: any) => {
  mod.moduleEval((table: any) =>
    Object.defineProperty(table, "enqueuedJobs", {
      configurable: true,
      get: function (this: any): any {
        return this.queueAdapter().enqueuedJobs;
      },
    }),
  );
  mod.defineMethod("setEnqueuedJobs", function (this: any, value: any): any {
    return (this.queueAdapter().enqueuedJobs = value);
  });
  mod.moduleEval((table: any) =>
    Object.defineProperty(table, "performedJobs", {
      configurable: true,
      get: function (this: any): any {
        return this.queueAdapter().performedJobs;
      },
    }),
  );
  mod.defineMethod("setPerformedJobs", function (this: any, value: any): any {
    return (this.queueAdapter().performedJobs = value);
  });
  mod.defineMethod("beforeSetup", beforeSetup);
  mod.defineMethod("afterTeardown", afterTeardown);
  mod.defineMethod("queueAdapterForTest", queueAdapterForTest);
  mod.defineMethod("assertEnqueuedJobs", assertEnqueuedJobs);
  mod.defineMethod("assertNoEnqueuedJobs", assertNoEnqueuedJobs);
  mod.defineMethod("assertPerformedJobs", assertPerformedJobs);
  mod.defineMethod("assertNoPerformedJobs", assertNoPerformedJobs);
  mod.defineMethod("assertEnqueuedWith", assertEnqueuedWith);
  mod.defineMethod("assertPerformedWith", assertPerformedWith);
  mod.defineMethod("performEnqueuedJobs", performEnqueuedJobs);
  mod.defineMethod("queueAdapter", queueAdapter);
  mod.defineMethod("requireActiveJobTestAdapterBang", requireActiveJobTestAdapterBang);
  mod.defineMethod("isUsingTestAdapter", isUsingTestAdapter);
  mod.defineMethod("clearEnqueuedJobs", clearEnqueuedJobs);
  mod.defineMethod("clearPerformedJobs", clearPerformedJobs);
  mod.defineMethod("jobsWith", jobsWith);
  mod.defineMethod("filterAsProc", filterAsProc);
  mod.defineMethod("enqueuedJobsWith", enqueuedJobsWith);
  mod.defineMethod("performedJobsWith", performedJobsWith);
  mod.defineMethod("flushEnqueuedJobs", flushEnqueuedJobs);
  mod.defineMethod("prepareArgsForAssertion", prepareArgsForAssertion);
  mod.defineMethod("deserializeArgsForAssertion", deserializeArgsForAssertion);
  mod.defineMethod("instantiateJob", instantiateJob);
  mod.defineMethod("queueAdapterChangedJobs", queueAdapterChangedJobs);
  mod.defineMethod("validateOption", validateOption);
});
{
  void "include ActiveSupport::Testing::Assertions: the test host's";
}
export const TestQueueAdapter: any = new Module();
extend(TestQueueAdapter, Concern);
TestQueueAdapter.included(null, function (this: any): void {
  const base = this;
  classAttribute.call(base, "_testAdapter", { instanceAccessor: false, instancePredicate: false });
});
export function disableTestAdapter(this: any): any {
  this._testAdapter = null;
  return this._testAdapter;
}

export function enableTestAdapter(this: any, testAdapter: any): any {
  this._testAdapter = testAdapter;
  return this._testAdapter;
}

export const ClassMethods: any = new Module((mod: any) => {
  mod.defineMethod("queueAdapter", function (this: any): any {
    if (this._testAdapter == null) {
      return ClassMethods.superMethod(this, "queueAdapter")!();
    } else {
      return this._testAdapter;
    }
  });
  mod.defineMethod("disableTestAdapter", disableTestAdapter);
  mod.defineMethod("enableTestAdapter", enableTestAdapter);
});
rbModConstSet(ActiveJobSeat, "TestHelper", TestHelper);
TestQueueAdapter.ClassMethods = ClassMethods;
onLoad("active_job", () => include(Base, TestQueueAdapter));
