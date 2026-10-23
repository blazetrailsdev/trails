import {
  _assertNothingRaisedOrWarn,
  compact as hashCompact,
  actsLike,
  descendants,
  underscore,
  Concern,
  classAttribute,
  ActiveSupport,
  onLoad,
} from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { Time as RubyTime } from "@blazetrails/date";
import {
  rbObjDup,
  rbInspect,
  aryJoin,
  ArgumentError,
  fetch,
  Enumerator,
  aryDelete,
  hashDelete,
  Range,
  rbObjSingletonClass,
  classModule,
  extend,
  Extended,
  include,
} from "@blazetrails/ruby-compat";
import { Arguments } from "./arguments.js";
import { Base } from "./base.js";
import { rbBinop } from "./codegen-runtime.js";
import { ClassMethods as BaseClassMethods } from "./queue-adapter.js";
import { TestAdapter } from "./queue-adapters/test-adapter.js";
import { expect } from "vitest";
import type { TestCase } from "./test-case.js";

export class TestHelper {
  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::TestHelper";
  }

  get enqueuedJobs() {
    return this.queueAdapter().enqueuedJobs;
  }

  set enqueuedJobs(value) {
    this.queueAdapter().enqueuedJobs = value;
  }

  get performedJobs() {
    return this.queueAdapter().performedJobs;
  }

  set performedJobs(value) {
    this.queueAdapter().performedJobs = value;
  }

  async beforeSetup(this: TestCase) {
    const queueAdapterSpecificToThisTestClass = this.queueAdapterForTest();
    for (const klass of this.queueAdapterChangedJobs()) {
      if (
        queueAdapterSpecificToThisTestClass != null &&
        queueAdapterSpecificToThisTestClass !== false
      ) {
        klass.enableTestAdapter(queueAdapterSpecificToThisTestClass);
      } else if (klass._queueAdapter == null) {
        klass.enableTestAdapter(new TestAdapter());
      }
    }
    this.clearEnqueuedJobs();
    this.clearPerformedJobs();
    return await ActiveSupportTestCase.prototype.beforeSetup.call(this);
  }

  async afterTeardown(this: TestCase) {
    await ActiveSupportTestCase.prototype.afterTeardown.call(this);
    return this.queueAdapterChangedJobs().forEach((klass) => klass.disableTestAdapter());
  }

  queueAdapterForTest(this: TestCase) {}

  async assertEnqueuedJobs(
    this: TestCase,
    number: number,
    {
      only = null,
      except = null,
      queue = null,
    }: { only?: unknown; except?: unknown; queue?: unknown } = {},
    block?: (...args: unknown[]) => unknown,
  ) {
    let originalJobs, newJobs, actualCount;
    this.requireActiveJobTestAdapterBang("assert_enqueued_jobs");
    if (block != null) {
      originalJobs = this.enqueuedJobsWith({ only: only, except: except, queue: queue });
      await _assertNothingRaisedOrWarn("assert_enqueued_jobs", block);
      newJobs = this.enqueuedJobsWith({ only: only, except: except, queue: queue });
      actualCount = rbBinop(newJobs, "-", originalJobs).length;
    } else {
      actualCount = this.enqueuedJobsWith({ only: only, except: except, queue: queue }).length;
    }
    return expect(actualCount).toEqualRuby(number);
  }

  async assertNoEnqueuedJobs(
    this: TestCase,
    {
      only = null,
      except = null,
      queue = null,
    }: { only?: unknown; except?: unknown; queue?: string | null } = {},
    block?: (...args: unknown[]) => unknown,
  ) {
    this.requireActiveJobTestAdapterBang("assert_no_enqueued_jobs");
    return await this.assertEnqueuedJobs(0, { only: only, except: except, queue: queue }, block);
  }

  async assertPerformedJobs(
    this: TestCase,
    number: number,
    {
      only = null,
      except = null,
      queue = null,
    }: { only?: unknown; except?: unknown; queue?: unknown } = {},
    block?: (...args: unknown[]) => unknown,
  ) {
    let originalCount, newCount, performedJobsSize;
    this.requireActiveJobTestAdapterBang("assert_performed_jobs");
    if (block != null) {
      originalCount = this.performedJobs.length;
      await this.performEnqueuedJobs({ only: only, except: except, queue: queue }, block);
      newCount = this.performedJobs.length;
      performedJobsSize = newCount - originalCount;
    } else {
      performedJobsSize = this.performedJobsWith({
        only: only,
        except: except,
        queue: queue,
      }).length;
    }
    return expect(performedJobsSize).toEqualRuby(number);
  }

  async assertNoPerformedJobs(
    this: TestCase,
    {
      only = null,
      except = null,
      queue = null,
    }: { only?: unknown; except?: unknown; queue?: string | null } = {},
    block?: (...args: unknown[]) => unknown,
  ) {
    this.requireActiveJobTestAdapterBang("assert_no_performed_jobs");
    return await this.assertPerformedJobs(0, { only: only, except: except, queue: queue }, block);
  }

  async assertEnqueuedWith(
    this: TestCase,
    {
      job = null,
      args = null,
      at = null,
      queue = null,
      priority = null,
    }: {
      job?: unknown;
      args?: unknown;
      at?: unknown;
      queue?: string | null;
      priority?: number | null;
    } = {},
    block?: (...args: unknown[]) => unknown,
  ): Promise<unknown> {
    let originalEnqueuedJobs, jobs;
    this.requireActiveJobTestAdapterBang("assert_enqueued_with");
    const expected = hashCompact({
      ":job": job,
      ":args": args,
      ":at": at,
      ":queue": queue,
      ":priority": priority,
    });
    const expectedArgs = this.prepareArgsForAssertion(expected);
    let potentialMatches: unknown = [];
    if (block != null) {
      originalEnqueuedJobs = rbObjDup(this.enqueuedJobs);
      await _assertNothingRaisedOrWarn("assert_enqueued_with", block);
      jobs = rbBinop(this.enqueuedJobs, "-", originalEnqueuedJobs);
    } else {
      jobs = this.enqueuedJobs;
    }
    const matchingJob = await (async (self, g) => {
      const xs: unknown[] = self;
      for (const x of xs) {
        const v = await g(x);
        if (v != null && v !== false) return x;
      }
      return null;
    })(jobs, async (enqueuedJob: unknown) => {
      const deserializedJob = await this.deserializeArgsForAssertion(enqueuedJob);
      potentialMatches.push(deserializedJob);
      return (
        expectedArgs instanceof globalThis.Map
          ? [...expectedArgs]
          : Array.isArray(expectedArgs)
            ? expectedArgs
            : Object.entries(expectedArgs ?? {})
      ).every(([key, value]) => {
        if (
          value != null &&
          "call" in Object(value) &&
          (value as { [name: string]: unknown })["call"] !==
            (Function.prototype as unknown as { [name: string]: unknown })["call"] &&
          (value as { [name: string]: unknown })["call"] !==
            (Object.prototype as unknown as { [name: string]: unknown })["call"]
        ) {
          return value(deserializedJob[key]);
        } else {
          return value === deserializedJob[key];
        }
      });
    });
    const matchingClass: unknown = potentialMatches.filter(
      (enqueuedJob: unknown) =>
        enqueuedJob["job_class"] === (Array.isArray(job) ? rbInspect(job) : String(job ?? "")),
    );
    let message = `No enqueued job found with ${expected ?? ""}`;
    if (potentialMatches.length === 0) {
      message = message + "\n\nNo jobs were enqueued";
    } else if (matchingClass.length === 0) {
      message =
        message +
        `\n\nNo jobs of class ${expected[":job"] ?? ""} were enqueued, job classes enqueued: `;
      message =
        message +
        aryJoin(
          potentialMatches.map((job: unknown) => job["job_class"]),
          ", ",
        );
    } else {
      message =
        message + `\n\nPotential matches: ${aryJoin(matchingClass as unknown[], "\n") ?? ""}`;
    }
    expect(matchingJob).toBeRubyTruthy();
    return await this.instantiateJob(matchingJob as Record<string, unknown>);
  }

  async assertPerformedWith(
    this: TestCase,
    {
      job = null,
      args = null,
      at = null,
      queue = null,
      priority = null,
    }: {
      job?: unknown;
      args?: unknown;
      at?: unknown;
      queue?: string | null;
      priority?: number | null;
    } = {},
    block?: (...args: unknown[]) => unknown,
  ): Promise<unknown> {
    let originalPerformedJobsCount, jobs;
    this.requireActiveJobTestAdapterBang("assert_performed_with");
    const expected = hashCompact({
      ":job": job,
      ":args": args,
      ":at": at,
      ":queue": queue,
      ":priority": priority,
    });
    const expectedArgs = this.prepareArgsForAssertion(expected);
    let potentialMatches: unknown = [];
    if (block != null) {
      originalPerformedJobsCount = this.performedJobs.length;
      await this.performEnqueuedJobs(undefined, block);
      jobs = this.performedJobs.slice(originalPerformedJobsCount);
    } else {
      jobs = this.performedJobs;
    }
    const matchingJob = await (async (self, g) => {
      const xs: unknown[] = self;
      for (const x of xs) {
        const v = await g(x);
        if (v != null && v !== false) return x;
      }
      return null;
    })(jobs, async (enqueuedJob: unknown) => {
      const deserializedJob = await this.deserializeArgsForAssertion(enqueuedJob);
      potentialMatches.push(deserializedJob);
      return (
        expectedArgs instanceof globalThis.Map
          ? [...expectedArgs]
          : Array.isArray(expectedArgs)
            ? expectedArgs
            : Object.entries(expectedArgs ?? {})
      ).every(([key, value]) => {
        if (
          value != null &&
          "call" in Object(value) &&
          (value as { [name: string]: unknown })["call"] !==
            (Function.prototype as unknown as { [name: string]: unknown })["call"] &&
          (value as { [name: string]: unknown })["call"] !==
            (Object.prototype as unknown as { [name: string]: unknown })["call"]
        ) {
          return value(deserializedJob[key]);
        } else {
          return value === deserializedJob[key];
        }
      });
    });
    const matchingClass: unknown = potentialMatches.filter(
      (enqueuedJob: unknown) =>
        enqueuedJob["job_class"] === (Array.isArray(job) ? rbInspect(job) : String(job ?? "")),
    );
    let message = `No performed job found with ${expected ?? ""}`;
    if (potentialMatches.length === 0) {
      message = message + "\n\nNo jobs were performed";
    } else if (matchingClass.length === 0) {
      message =
        message +
        `\n\nNo jobs of class ${expected[":job"] ?? ""} were performed, job classes performed: `;
      message =
        message +
        aryJoin(
          potentialMatches.map((job: unknown) => job["job_class"]),
          ", ",
        );
    } else {
      message =
        message + `\n\nPotential matches: ${aryJoin(matchingClass as unknown[], "\n") ?? ""}`;
    }
    expect(matchingJob).toBeRubyTruthy();
    return await this.instantiateJob(matchingJob as Record<string, unknown>);
  }

  async performEnqueuedJobs(
    this: TestCase,
    {
      only = null,
      except = null,
      queue = null,
      at = null,
    }: { only?: unknown; except?: unknown; queue?: unknown; at?: unknown } = {},
    block?: (...args: unknown[]) => unknown,
  ) {
    if (!(block != null)) {
      this.requireActiveJobTestAdapterBang("perform_enqueued_jobs (without a block)");
      return await this.flushEnqueuedJobs({ only: only, except: except, queue: queue, at: at });
    }
    if (!this.isUsingTestAdapter()) {
      return await _assertNothingRaisedOrWarn("perform_enqueued_jobs", block);
    }
    this.validateOption({ only: only, except: except });
    const oldPerformEnqueuedJobs = this.queueAdapter().performEnqueuedJobs;
    const oldPerformEnqueuedAtJobs = this.queueAdapter().performEnqueuedAtJobs;
    const oldFilter = this.queueAdapter().filter;
    const oldReject = this.queueAdapter().reject;
    const oldQueue = this.queueAdapter().queue;
    const oldAt = this.queueAdapter().at;
    try {
      this.queueAdapter().performEnqueuedJobs = true;
      this.queueAdapter().performEnqueuedAtJobs = true;
      this.queueAdapter().filter = only;
      this.queueAdapter().reject = except;
      this.queueAdapter().queue = queue;
      this.queueAdapter().at = at;
      return await _assertNothingRaisedOrWarn("perform_enqueued_jobs", block);
    } finally {
      this.queueAdapter().performEnqueuedJobs = oldPerformEnqueuedJobs;
      this.queueAdapter().performEnqueuedAtJobs = oldPerformEnqueuedAtJobs;
      this.queueAdapter().filter = oldFilter;
      this.queueAdapter().reject = oldReject;
      this.queueAdapter().queue = oldQueue;
      this.queueAdapter().at = oldAt;
    }
  }

  queueAdapter(this: TestCase) {
    return Base.queueAdapter;
  }

  /** @internal */
  requireActiveJobTestAdapterBang(this: TestCase, method: string) {
    if (!this.isUsingTestAdapter()) {
      throw new ArgumentError(
        `${method} requires the Active Job test adapter, you're using ${((x) => (Object.hasOwn(x, "toString") ? String(x) : x.name || null))(this.queueAdapter().constructor) ?? ""}.`,
      );
    }
    return null;
  }

  /** @internal */
  isUsingTestAdapter(this: TestCase): boolean {
    return this.queueAdapter() instanceof TestAdapter;
  }

  /** @internal */
  clearEnqueuedJobs(this: TestCase) {
    if (this.isUsingTestAdapter()) {
      return ((this.enqueuedJobs.length = 0), this.enqueuedJobs);
    }
    return null;
  }

  /** @internal */
  clearPerformedJobs(this: TestCase) {
    if (this.isUsingTestAdapter()) {
      return ((this.performedJobs.length = 0), this.performedJobs);
    }
    return null;
  }

  /** @internal */
  jobsWith(
    this: TestCase,
    jobs: unknown[],
    {
      only = null,
      except = null,
      queue = null,
      at = null,
    }: { only?: unknown; except?: unknown; queue?: unknown; at?: unknown } = {},
    block?: (...args: unknown[]) => unknown,
  ): unknown[] {
    this.validateOption({ only: only, except: except });
    return ((x) =>
      x instanceof globalThis.Set || x instanceof globalThis.Map || x instanceof Enumerator
        ? [...x]
        : Object.getPrototypeOf(x) === Object.prototype
          ? Object.entries(x as object)
          : (x as unknown[]))(rbObjDup(jobs)).filter((job) => {
      const jobClass = fetch(job, ":job");
      if (only != null && only !== false) {
        if (!((this.filterAsProc(only)(job) ?? false) !== false)) {
          return false;
        }
      } else if (except != null && except !== false) {
        if ((this.filterAsProc(except)(job) ?? false) !== false) {
          return false;
        }
      }
      if (queue != null && queue !== false) {
        if (
          !(
            (Array.isArray(queue) ? rbInspect(queue) : String(queue ?? "")) ===
            fetch(job, ":queue", jobClass.queueName)
          )
        ) {
          return false;
        }
      }
      if (at != null && at !== false && (job[":at"] ?? false) !== false) {
        if (rbBinop(job[":at"], ">", Number(at))) {
          return false;
        }
      }
      if (block != null) {
        block(job);
      }
      return true;
    });
  }

  /** @internal */
  filterAsProc(this: TestCase, filter: unknown): (...args: unknown[]) => unknown {
    if (
      typeof filter === "function" &&
      !Function.prototype.toString.call(filter).startsWith("class")
    ) {
      return filter;
    }
    return (job?: unknown) =>
      (filter == null ? [] : Array.isArray(filter) ? (filter as unknown[]) : [filter]).includes(
        fetch(job, ":job"),
      );
  }

  /** @internal */
  enqueuedJobsWith(
    this: TestCase,
    {
      only = null,
      except = null,
      queue = null,
      at = null,
    }: { only?: unknown; except?: unknown; queue?: unknown; at?: unknown } = {},
    block?: (...args: unknown[]) => unknown,
  ): unknown[] {
    return this.jobsWith(
      this.enqueuedJobs as unknown[],
      { only: only, except: except, queue: queue, at: at },
      block,
    );
  }

  /** @internal */
  performedJobsWith(
    this: TestCase,
    {
      only = null,
      except = null,
      queue = null,
    }: { only?: unknown; except?: unknown; queue?: unknown } = {},
    block?: (...args: unknown[]) => unknown,
  ): unknown[] {
    return this.jobsWith(
      this.performedJobs as unknown[],
      { only: only, except: except, queue: queue },
      block,
    );
  }

  /** @internal */
  async flushEnqueuedJobs(
    this: TestCase,
    {
      only = null,
      except = null,
      queue = null,
      at = null,
    }: { only?: unknown; except?: unknown; queue?: unknown; at?: unknown } = {},
  ): Promise<number> {
    return this.enqueuedJobsWith(
      { only: only, except: except, queue: queue, at: at },
      async (payload) => {
        ((x) => (Array.isArray(x) ? aryDelete(x, payload) : hashDelete(x, payload)))(
          this.queueAdapter().enqueuedJobs,
        );
        ((x) =>
          typeof x === "string"
            ? x + payload
            : Array.isArray(x)
              ? (x.push(payload), x)
              : x instanceof globalThis.Set
                ? x.add(payload)
                : x.append(payload))(this.queueAdapter().performedJobs);
        return await (
          await this.instantiateJob(payload as Record<string, unknown>, {
            skipDeserializeArguments: true,
          })
        ).performNow();
      },
    ).length;
  }

  /** @internal */
  prepareArgsForAssertion(
    this: TestCase,
    args: Partial<{
      ":job": unknown;
      ":args": unknown;
      ":at": unknown;
      ":queue": string | null;
      ":priority": number | null;
    }>,
  ) {
    return ((arguments_) => {
      let atRange: unknown;
      if (typeof arguments_[":queue"] === "string") {
        arguments_[":queue"] = ((x) => (Array.isArray(x) ? rbInspect(x) : String(x ?? "")))(
          arguments_[":queue"],
        );
      }
      if (actsLike.call(arguments_[":at"], "time")) {
        atRange = new Range(
          rbBinop(arguments_[":at"], "-", 1),
          rbBinop(arguments_[":at"], "+", 1),
          false,
        );
        arguments_[":at"] = (at?: unknown): unknown => atRange.cover(at);
      }
      return arguments_;
    })(rbObjDup(args));
  }

  /** @internal */
  async deserializeArgsForAssertion(this: TestCase, job: unknown) {
    return await (async (newJob) => {
      if ((newJob[":at"] ?? false) !== false) {
        newJob[":at"] = RubyTime.at(newJob[":at"]);
      }
      if ((newJob[":args"] ?? false) !== false) {
        newJob[":args"] = await Arguments.deserialize(newJob[":args"]);
      }
      return newJob;
    })(rbObjDup(job));
  }

  /** @internal */
  async instantiateJob(
    this: TestCase,
    payload: Record<string, unknown>,
    { skipDeserializeArguments = false }: { skipDeserializeArguments?: boolean } = {},
  ) {
    const job = payload[":job"].deserialize(payload);
    if (Object.hasOwn(payload, ":at")) {
      job.scheduledAt = RubyTime.at(payload[":at"]);
    }
    if (!skipDeserializeArguments) {
      await job.deserializeArgumentsIfNeeded();
    }
    return job;
  }

  /** @internal */
  queueAdapterChangedJobs(this: TestCase): unknown[] {
    return ((x) =>
      x instanceof globalThis.Set || x instanceof globalThis.Map || x instanceof Enumerator
        ? [...x]
        : Object.getPrototypeOf(x) === Object.prototype
          ? Object.entries(x as object)
          : (x as unknown[]))(
      ((x) =>
        typeof x === "string"
          ? x + Base
          : Array.isArray(x)
            ? (x.push(Base), x)
            : x instanceof globalThis.Set
              ? x.add(Base)
              : x.append(Base))(descendants(Base)),
    ).filter((klass) =>
      ((x) =>
        x instanceof globalThis.Set || x instanceof globalThis.Map || x instanceof Enumerator
          ? [...x]
          : Object.getPrototypeOf(x) === Object.prototype
            ? Object.entries(x as object)
            : (x as unknown[]))(
        Object.getOwnPropertyNames(klass)
          .filter((n) => !["length", "name", "prototype"].includes(n))
          .map((n) => n.replace(/^__class_attr_/, ""))
          .map((n) =>
            ((u: string) => (n.startsWith("_") && !u.startsWith("_") ? "_" + u : u))(underscore(n)),
          ),
      ).includes("_queue_adapter"),
    );
  }

  /** @internal */
  validateOption(
    this: TestCase,
    { only = null, except = null }: { only?: unknown; except?: unknown } = {},
  ) {
    if (only != null && only !== false && except != null && except !== false) {
      throw new ArgumentError("Cannot specify both `:only` and `:except` options.");
    }
    return null;
  }
}
export class TestQueueAdapter {
  declare static included: Extended<typeof Concern>["included"];
  declare static ClassMethods: typeof ClassMethods;

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::TestHelper::TestQueueAdapter";
  }
}
extend(TestQueueAdapter, Concern);
TestQueueAdapter.included(null, function (this: typeof Base): void {
  classAttribute.call(this, "_testAdapter", { instanceAccessor: false, instancePredicate: false });
});
export class ClassMethods {
  declare static _testAdapter: unknown;

  static toString(): string {
    return "ActiveJob::TestHelper::TestQueueAdapter::ClassMethods";
  }

  static get queueAdapter() {
    if (this._testAdapter == null) {
      return Reflect.get(BaseClassMethods, "queueAdapter", this);
    } else {
      return this._testAdapter;
    }
  }

  static disableTestAdapter(this: typeof Base) {
    this._testAdapter = null;
    return this._testAdapter;
  }

  static enableTestAdapter(this: typeof Base, testAdapter: unknown) {
    this._testAdapter = testAdapter as null;
    return this._testAdapter;
  }
}
Object.assign(TestQueueAdapter, { ClassMethods: ClassMethods });
onLoad("active_job", function () {
  return include(Base, TestQueueAdapter);
});
