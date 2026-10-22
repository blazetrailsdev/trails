import {
  Concern,
  DescendantsTracker,
  actsLike,
  assert,
  assertEqual,
  _assertNothingRaisedOrWarn,
  classAttribute,
  extend,
  kernelArray,
  onLoad,
} from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import {
  ArgumentError,
  Range,
  classModule,
  fetch,
  include,
  rbCallSuper,
  rbEql,
  rbEqual,
  rbInspect,
  rbModConstSet,
  rbModName,
  rbObjClass,
  rbObjDup,
  rbObjIsProc,
  rbObjRespondTo,
  toF,
  toS,
} from "@blazetrails/ruby-compat";
import { ActiveJob, QueueAdapters } from "./namespaces.js";
import type { TestAdapter } from "./queue-adapters/test-adapter.js";
import { ClassMethods as QueueAdapterClassMethods } from "./queue-adapter.js";

type Payload = Record<string, unknown>;
type Filter = unknown;

interface JobsWithOptions {
  only?: Filter;
  except?: Filter;
  queue?: unknown;
  at?: unknown;
}

interface AssertEnqueuedWithOptions {
  job?: unknown;
  args?: unknown;
  at?: unknown;
  queue?: unknown;
  priority?: unknown;
}

interface TestQueueAdapterClass {
  _testAdapter: unknown;
  _queueAdapter: unknown;
  enableTestAdapter(testAdapter: unknown): void;
  disableTestAdapter(): void;
}

interface DeserializableJob {
  scheduledAt: unknown;
  deserializeArgumentsIfNeeded(): Promise<void>;
}

export const ClassMethods = {
  get queueAdapter(): unknown {
    const self = this as unknown as TestQueueAdapterClass;
    return self._testAdapter == null
      ? Reflect.get(QueueAdapterClassMethods, "queueAdapter", this)
      : self._testAdapter;
  },

  disableTestAdapter(this: TestQueueAdapterClass): void {
    this._testAdapter = null;
  },

  enableTestAdapter(this: TestQueueAdapterClass, testAdapter: unknown): void {
    this._testAdapter = testAdapter;
  },
};

export class TestQueueAdapter {
  static readonly [classModule] = true;
  static ClassMethods = ClassMethods;
}
extend(TestQueueAdapter, Concern);
(
  TestQueueAdapter as unknown as { included(base: null, block: (this: object) => void): void }
).included(null, function (this: object) {
  classAttribute.call(this, "_testAdapter", { instanceAccessor: false, instancePredicate: false });
});

onLoad("active_job", () => {
  include(ActiveJob.Base, TestQueueAdapter);
});

export async function beforeSetup(this: TestHelper): Promise<unknown> {
  const queueAdapterSpecificToThisTestClass = this.queueAdapterForTest();
  for (const klass of this.queueAdapterChangedJobs()) {
    if (
      queueAdapterSpecificToThisTestClass != null &&
      queueAdapterSpecificToThisTestClass !== false
    ) {
      klass.enableTestAdapter(queueAdapterSpecificToThisTestClass);
    } else if (klass._queueAdapter == null) {
      klass.enableTestAdapter(new QueueAdapters.TestAdapter());
    }
  }

  this.clearEnqueuedJobs();
  this.clearPerformedJobs();
  return await rbCallSuper(this, beforeSetup);
}

export async function afterTeardown(this: TestHelper): Promise<void> {
  await rbCallSuper(this, afterTeardown);

  for (const klass of this.queueAdapterChangedJobs()) klass.disableTestAdapter();
}

export function queueAdapterForTest(): unknown {
  return null;
}

export async function assertEnqueuedJobs(
  this: TestHelper,
  number: number,
  { only = null, except = null, queue = null }: JobsWithOptions = {},
  block: (() => unknown) | null = null,
): Promise<void> {
  this.requireActiveJobTestAdapterBang("assert_enqueued_jobs");

  let actualCount: number;
  if (block != null) {
    const originalJobs = this.enqueuedJobsWith({ only, except, queue });

    await _assertNothingRaisedOrWarn("assert_enqueued_jobs", block);

    const newJobs = this.enqueuedJobsWith({ only, except, queue });

    actualCount = newJobs.filter((job) => !originalJobs.some((e) => rbEql(e, job))).length;
  } else {
    actualCount = this.enqueuedJobsWith({ only, except, queue }).length;
  }

  assertEqual(number, actualCount, `${number} jobs expected, but ${actualCount} were enqueued`);
}

export async function assertNoEnqueuedJobs(
  this: TestHelper,
  { only = null, except = null, queue = null }: JobsWithOptions = {},
  block: (() => unknown) | null = null,
): Promise<void> {
  this.requireActiveJobTestAdapterBang("assert_no_enqueued_jobs");

  await this.assertEnqueuedJobs(0, { only, except, queue }, block);
}

export async function assertPerformedJobs(
  this: TestHelper,
  number: number,
  { only = null, except = null, queue = null }: JobsWithOptions = {},
  block: (() => unknown) | null = null,
): Promise<void> {
  this.requireActiveJobTestAdapterBang("assert_performed_jobs");

  let performedJobsSize: number;
  if (block != null) {
    const originalCount = this.performedJobs.length;

    await this.performEnqueuedJobs({ only, except, queue }, block);

    const newCount = this.performedJobs.length;

    performedJobsSize = newCount - originalCount;
  } else {
    performedJobsSize = this.performedJobsWith({ only, except, queue }).length;
  }

  assertEqual(
    number,
    performedJobsSize,
    `${number} jobs expected, but ${performedJobsSize} were performed`,
  );
}

export async function assertNoPerformedJobs(
  this: TestHelper,
  { only = null, except = null, queue = null }: JobsWithOptions = {},
  block: (() => unknown) | null = null,
): Promise<void> {
  this.requireActiveJobTestAdapterBang("assert_no_performed_jobs");

  await this.assertPerformedJobs(0, { only, except, queue }, block);
}

export async function assertEnqueuedWith(
  this: TestHelper,
  {
    job = null,
    args = null,
    at = null,
    queue = null,
    priority = null,
  }: AssertEnqueuedWithOptions = {},
  block: (() => unknown) | null = null,
): Promise<unknown> {
  this.requireActiveJobTestAdapterBang("assert_enqueued_with");

  const expected: Payload = Object.fromEntries(
    Object.entries({
      ":job": job,
      ":args": args,
      ":at": at,
      ":queue": queue,
      ":priority": priority,
    }).filter(([, value]) => value != null),
  );
  const expectedArgs = this.prepareArgsForAssertion(expected);
  const potentialMatches: Payload[] = [];

  let jobs: Payload[];
  if (block != null) {
    const originalEnqueuedJobs = rbObjDup(this.enqueuedJobs);

    await _assertNothingRaisedOrWarn("assert_enqueued_with", block);

    jobs = this.enqueuedJobs.filter((e) => !originalEnqueuedJobs.some((o) => rbEql(o, e)));
  } else {
    jobs = this.enqueuedJobs;
  }

  let matchingJob: Payload | undefined;
  for (const enqueuedJob of jobs) {
    const deserializedJob = await this.deserializeArgsForAssertion(enqueuedJob);
    potentialMatches.push(deserializedJob);

    const matched = Object.entries(expectedArgs).every(([key, value]) => {
      if (rbObjRespondTo(value, "call")) {
        return (value as (arg: unknown) => unknown)(deserializedJob[key]);
      } else {
        return rbEqual(value, deserializedJob[key]);
      }
    });
    if (matched) {
      matchingJob = enqueuedJob;
      break;
    }
  }

  const matchingClass = potentialMatches.filter(
    (enqueuedJob) => enqueuedJob["job_class"] === toS(job),
  );

  let message = `No enqueued job found with ${rbInspect(expected)}`;
  if (potentialMatches.length === 0) {
    message += "\n\nNo jobs were enqueued";
  } else if (matchingClass.length === 0) {
    message += `\n\nNo jobs of class ${toS(expected[":job"])} were enqueued, job classes enqueued: `;
    message += potentialMatches.map((job) => job["job_class"]).join(", ");
  } else {
    message += `\n\nPotential matches: ${matchingClass.map((job) => toS(job)).join("\n")}`;
  }

  assert(matchingJob, message);
  return await this.instantiateJob(matchingJob!);
}

export async function assertPerformedWith(
  this: TestHelper,
  {
    job = null,
    args = null,
    at = null,
    queue = null,
    priority = null,
  }: AssertEnqueuedWithOptions = {},
  block: (() => unknown) | null = null,
): Promise<unknown> {
  this.requireActiveJobTestAdapterBang("assert_performed_with");

  const expected: Payload = Object.fromEntries(
    Object.entries({
      ":job": job,
      ":args": args,
      ":at": at,
      ":queue": queue,
      ":priority": priority,
    }).filter(([, value]) => value != null),
  );
  const expectedArgs = this.prepareArgsForAssertion(expected);
  const potentialMatches: Payload[] = [];

  let jobs: Payload[];
  if (block != null) {
    const originalPerformedJobsCount = this.performedJobs.length;

    await this.performEnqueuedJobs({}, block);

    jobs = this.performedJobs.slice(originalPerformedJobsCount);
  } else {
    jobs = this.performedJobs;
  }

  let matchingJob: Payload | undefined;
  for (const enqueuedJob of jobs) {
    const deserializedJob = await this.deserializeArgsForAssertion(enqueuedJob);
    potentialMatches.push(deserializedJob);

    const matched = Object.entries(expectedArgs).every(([key, value]) => {
      if (rbObjRespondTo(value, "call")) {
        return (value as (arg: unknown) => unknown)(deserializedJob[key]);
      } else {
        return rbEqual(value, deserializedJob[key]);
      }
    });
    if (matched) {
      matchingJob = enqueuedJob;
      break;
    }
  }

  const matchingClass = potentialMatches.filter(
    (enqueuedJob) => enqueuedJob["job_class"] === toS(job),
  );

  let message = `No performed job found with ${rbInspect(expected)}`;
  if (potentialMatches.length === 0) {
    message += "\n\nNo jobs were performed";
  } else if (matchingClass.length === 0) {
    message += `\n\nNo jobs of class ${toS(expected[":job"])} were performed, job classes performed: `;
    message += potentialMatches.map((job) => job["job_class"]).join(", ");
  } else {
    message += `\n\nPotential matches: ${matchingClass.map((job) => toS(job)).join("\n")}`;
  }

  assert(matchingJob, message);
  return await this.instantiateJob(matchingJob!);
}

export async function performEnqueuedJobs(
  this: TestHelper,
  { only = null, except = null, queue = null, at = null }: JobsWithOptions = {},
  block: (() => unknown) | null = null,
): Promise<unknown> {
  if (block == null) {
    this.requireActiveJobTestAdapterBang("perform_enqueued_jobs (without a block)");
    return await this.flushEnqueuedJobs({ only, except, queue, at });
  }

  if (!this.isUsingTestAdapter()) {
    return await _assertNothingRaisedOrWarn("perform_enqueued_jobs", block);
  }

  this.validateOption({ only, except });

  const queueAdapter = this.queueAdapter() as TestAdapter;
  const oldPerformEnqueuedJobs = queueAdapter.performEnqueuedJobs;
  const oldPerformEnqueuedAtJobs = queueAdapter.performEnqueuedAtJobs;
  const oldFilter = queueAdapter.filter;
  const oldReject = queueAdapter.reject;
  const oldQueue = queueAdapter.queue;
  const oldAt = queueAdapter.at;

  try {
    queueAdapter.performEnqueuedJobs = true;
    queueAdapter.performEnqueuedAtJobs = true;
    queueAdapter.filter = only;
    queueAdapter.reject = except;
    queueAdapter.queue = queue;
    queueAdapter.at = at;

    return await _assertNothingRaisedOrWarn("perform_enqueued_jobs", block);
  } finally {
    queueAdapter.performEnqueuedJobs = oldPerformEnqueuedJobs;
    queueAdapter.performEnqueuedAtJobs = oldPerformEnqueuedAtJobs;
    queueAdapter.filter = oldFilter;
    queueAdapter.reject = oldReject;
    queueAdapter.queue = oldQueue;
    queueAdapter.at = oldAt;
  }
}

export function queueAdapter(): unknown {
  return ActiveJob.Base.queueAdapter;
}

/** @internal */
export function requireActiveJobTestAdapterBang(this: TestHelper, method: string): void {
  if (!this.isUsingTestAdapter()) {
    throw new ArgumentError(
      `${method} requires the Active Job test adapter, you're using ${rbModName(rbObjClass(this.queueAdapter()))}.`,
    );
  }
}

/** @internal */
export function isUsingTestAdapter(this: TestHelper): boolean {
  return this.queueAdapter() instanceof QueueAdapters.TestAdapter;
}

/** @internal */
export function clearEnqueuedJobs(this: TestHelper): void {
  if (this.isUsingTestAdapter()) this.enqueuedJobs.length = 0;
}

/** @internal */
export function clearPerformedJobs(this: TestHelper): void {
  if (this.isUsingTestAdapter()) this.performedJobs.length = 0;
}

/** @internal */
export function jobsWith(
  this: TestHelper,
  jobs: Payload[],
  { only = null, except = null, queue = null, at = null }: JobsWithOptions = {},
  block: ((job: Payload) => void) | null = null,
): Payload[] {
  this.validateOption({ only, except });

  return rbObjDup(jobs).filter((job) => {
    const jobClass: { queueName: unknown } = fetch(job, ":job");

    if (only != null && only !== false) {
      if (!(this.filterAsProc(only)(job) as boolean)) return false;
    } else if (except != null && except !== false) {
      if (this.filterAsProc(except)(job) as boolean) return false;
    }

    if (queue != null && queue !== false) {
      if (toS(queue) !== fetch(job, ":queue", jobClass.queueName)) return false;
    }

    if (at != null && at !== false && job[":at"] != null && job[":at"] !== false) {
      if ((job[":at"] as number) > toF(at)) return false;
    }

    if (block != null) block(job);

    return true;
  });
}

/** @internal */
export function filterAsProc(filter: Filter): (job: Payload) => unknown {
  if (rbObjIsProc(filter)) return filter as (job: Payload) => unknown;

  return (job) => kernelArray(filter).includes(fetch(job, ":job"));
}

/** @internal */
export function enqueuedJobsWith(
  this: TestHelper,
  { only = null, except = null, queue = null, at = null }: JobsWithOptions = {},
  block: ((job: Payload) => void) | null = null,
): Payload[] {
  return this.jobsWith(this.enqueuedJobs, { only, except, queue, at }, block);
}

/** @internal */
export function performedJobsWith(
  this: TestHelper,
  { only = null, except = null, queue = null }: JobsWithOptions = {},
  block: ((job: Payload) => void) | null = null,
): Payload[] {
  return this.jobsWith(this.performedJobs, { only, except, queue }, block);
}

/** @internal */
export async function flushEnqueuedJobs(
  this: TestHelper,
  { only = null, except = null, queue = null, at = null }: JobsWithOptions = {},
): Promise<number> {
  let performed: Promise<void> = Promise.resolve();
  const count = this.enqueuedJobsWith({ only, except, queue, at }, (payload) => {
    performed = performed.then(async () => {
      const queueAdapter = this.queueAdapter() as TestAdapter;
      const enqueuedJobs = queueAdapter.enqueuedJobs;
      for (let i = enqueuedJobs.length - 1; i >= 0; i--) {
        if (rbEqual(enqueuedJobs[i], payload)) enqueuedJobs.splice(i, 1);
      }
      queueAdapter.performedJobs.push(payload);
      const job = (await this.instantiateJob(payload, { skipDeserializeArguments: true })) as {
        performNow(): Promise<unknown>;
      };
      await job.performNow();
    });
  }).length;
  await performed;
  return count;
}

/** @internal */
export function prepareArgsForAssertion(args: Payload): Payload {
  const arguments_ = rbObjDup(args);
  if (typeof arguments_[":queue"] === "string" && arguments_[":queue"].startsWith(":")) {
    arguments_[":queue"] = arguments_[":queue"].slice(1);
  }

  if (actsLike.call(arguments_[":at"], "time")) {
    const at = arguments_[":at"] as Time;
    const atRange = new Range(at.minus(1), at.plus(1));
    arguments_[":at"] = (at: Time) => atRange.cover(at);
  }
  return arguments_;
}

/** @internal */
export async function deserializeArgsForAssertion(job: Payload): Promise<Payload> {
  const newJob = rbObjDup(job);
  if (newJob[":at"] != null && newJob[":at"] !== false) {
    newJob[":at"] = Time.at(newJob[":at"] as number);
  }
  if (newJob[":args"] != null && newJob[":args"] !== false) {
    newJob[":args"] = await ActiveJob.Arguments.deserialize(newJob[":args"] as unknown[]);
  }
  return newJob;
}

/** @internal */
export async function instantiateJob(
  payload: Payload,
  { skipDeserializeArguments = false }: { skipDeserializeArguments?: boolean } = {},
): Promise<unknown> {
  const job = (payload[":job"] as { deserialize(payload: Payload): DeserializableJob }).deserialize(
    payload,
  );
  if (Object.hasOwn(payload, ":at")) job.scheduledAt = Time.at(payload[":at"] as number);
  if (!skipDeserializeArguments) await job.deserializeArgumentsIfNeeded();
  return job;
}

/**
 * @internal
 * @missingRailsArgs descendants — PERMANENT
 */
export function queueAdapterChangedJobs(): TestQueueAdapterClass[] {
  const descendants = DescendantsTracker.descendants(ActiveJob.Base);
  descendants.push(ActiveJob.Base);
  return descendants.filter((klass) =>
    Object.hasOwn(klass, "__class_attr__queueAdapter"),
  ) as unknown as TestQueueAdapterClass[];
}

/** @internal */
export function validateOption({ only = null, except = null }: JobsWithOptions = {}): void {
  if (only != null && only !== false && except != null && except !== false) {
    throw new ArgumentError("Cannot specify both `:only` and `:except` options.");
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TestHelper {
  static readonly [classModule] = true;
  static TestQueueAdapter = TestQueueAdapter;

  get enqueuedJobs(): Payload[] {
    return (this.queueAdapter() as TestAdapter).enqueuedJobs;
  }

  set enqueuedJobs(enqueuedJobs: Payload[]) {
    (this.queueAdapter() as TestAdapter).enqueuedJobs = enqueuedJobs;
  }

  get performedJobs(): Payload[] {
    return (this.queueAdapter() as TestAdapter).performedJobs;
  }

  set performedJobs(performedJobs: Payload[]) {
    (this.queueAdapter() as TestAdapter).performedJobs = performedJobs;
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TestHelper {
  beforeSetup: typeof beforeSetup;
  afterTeardown: typeof afterTeardown;
  queueAdapterForTest: typeof queueAdapterForTest;
  assertEnqueuedJobs: typeof assertEnqueuedJobs;
  assertNoEnqueuedJobs: typeof assertNoEnqueuedJobs;
  assertPerformedJobs: typeof assertPerformedJobs;
  assertNoPerformedJobs: typeof assertNoPerformedJobs;
  assertEnqueuedWith: typeof assertEnqueuedWith;
  assertPerformedWith: typeof assertPerformedWith;
  performEnqueuedJobs: typeof performEnqueuedJobs;
  queueAdapter: typeof queueAdapter;
  requireActiveJobTestAdapterBang: typeof requireActiveJobTestAdapterBang;
  isUsingTestAdapter: typeof isUsingTestAdapter;
  clearEnqueuedJobs: typeof clearEnqueuedJobs;
  clearPerformedJobs: typeof clearPerformedJobs;
  jobsWith: typeof jobsWith;
  filterAsProc: typeof filterAsProc;
  enqueuedJobsWith: typeof enqueuedJobsWith;
  performedJobsWith: typeof performedJobsWith;
  flushEnqueuedJobs: typeof flushEnqueuedJobs;
  prepareArgsForAssertion: typeof prepareArgsForAssertion;
  deserializeArgsForAssertion: typeof deserializeArgsForAssertion;
  instantiateJob: typeof instantiateJob;
  queueAdapterChangedJobs: typeof queueAdapterChangedJobs;
  validateOption: typeof validateOption;
}
Object.assign(TestHelper.prototype, {
  beforeSetup,
  afterTeardown,
  queueAdapterForTest,
  assertEnqueuedJobs,
  assertNoEnqueuedJobs,
  assertPerformedJobs,
  assertNoPerformedJobs,
  assertEnqueuedWith,
  assertPerformedWith,
  performEnqueuedJobs,
  queueAdapter,
  requireActiveJobTestAdapterBang,
  isUsingTestAdapter,
  clearEnqueuedJobs,
  clearPerformedJobs,
  jobsWith,
  filterAsProc,
  enqueuedJobsWith,
  performedJobsWith,
  flushEnqueuedJobs,
  prepareArgsForAssertion,
  deserializeArgsForAssertion,
  instantiateJob,
  queueAdapterChangedJobs,
  validateOption,
});
rbModConstSet(ActiveJob, "TestHelper", TestHelper);
