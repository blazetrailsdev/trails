import { afterEach, describe, expect, it } from "vitest";
import { days, freezeTime, travelBack, useZone } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import {
  rbHashSRuby2KeywordsHashP,
  rbModConstSet,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";
import { Base } from "./base.js";

class HelloJob extends Base {}
registerConstant("HelloJob", HelloJob);

class LoggingJob extends Base {
  get jobId(): string {
    return "LOGGING-JOB-ID";
  }
  set jobId(_value: string) {}
}

describe("ActiveJob::Core", () => {
  afterEach(() => travelBack());

  it("lets a subclass accessor override job_id", () => {
    const job = new LoggingJob();
    expect(job.jobId).toBe("LOGGING-JOB-ID");
    expect(job.serialize()["job_id"]).toBe("LOGGING-JOB-ID");
  });

  it("initializes the Rails defaults", () => {
    const job = new HelloJob("Rafael");
    expect(job.arguments).toEqual(["Rafael"]);
    expect(job.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(job.executions).toBe(0);
    expect(job.exceptionExecutions).toEqual({});
    expect(job.scheduledAt).toBeNull();
    expect(job.timezone).toBeNull();
  });

  it("flags a trailing kwargs object ruby2_keywords", () => {
    const job = new HelloJob(1, { a: 1 });
    expect(rbHashSRuby2KeywordsHashP(job.arguments[1] as object)).toBe(true);
  });

  it("reads the zone name into timezone", () => {
    useZone("Hawaii", () => {
      expect(new HelloJob().timezone).toBe("Hawaii");
    });
  });

  it("serializes in Rails' key order with the Ruby class name", () => {
    const serialized = new HelloJob("Rafael").serialize();
    expect(Object.keys(serialized)).toEqual([
      "job_class",
      "job_id",
      "provider_job_id",
      "queue_name",
      "priority",
      "arguments",
      "executions",
      "exception_executions",
      "locale",
      "timezone",
      "enqueued_at",
      "scheduled_at",
    ]);
    expect(serialized["job_class"]).toBe("HelloJob");
    expect(serialized["arguments"]).toEqual(["Rafael"]);
    expect(serialized["locale"]).toBe("en");
  });

  it("round-trips enqueued_at with nanosecond precision", () => {
    freezeTime();
    const serialized = new HelloJob().serialize();
    expect(serialized["enqueued_at"]).toMatch(/\.\d{9}Z$/);
    const job = Base.deserialize<HelloJob>(serialized);
    expect(job).toBeInstanceOf(HelloJob);
    expect(job.enqueuedAt!.iso8601(9)).toBe(serialized["enqueued_at"]);
  });

  it("keeps an empty locale and timezone, as Ruby || does", () => {
    const job = new HelloJob();
    job.deserialize({ locale: "", timezone: "" });
    expect(job.locale).toBe("");
    expect(job.timezone).toBe("");
  });

  it("falls back to I18n.locale when locale is absent", () => {
    const job = new HelloJob();
    job.deserialize({});
    expect(job.locale).toBe("en");
    expect(job.enqueuedAt).toBeNull();
  });

  it("treats an empty serialized arguments array as serialized", async () => {
    const job = new HelloJob("x");
    job.deserialize({ arguments: [] });
    expect(job.serialize()["arguments"]).toEqual([]);
    await job.deserializeArgumentsIfNeeded();
    expect(job.arguments).toEqual([]);
    expect(job.isArgumentsSerialized()).toBeNull();
  });

  it("returns the stored successfully_enqueued value", () => {
    const job = new HelloJob();
    expect(job.isSuccessfullyEnqueued()).toBeUndefined();
    job.successfullyEnqueued = false;
    expect(job.isSuccessfullyEnqueued()).toBe(false);
  });

  it("schedules wait: 0 at now", () => {
    freezeTime();
    const job = new HelloJob().set({ wait: 0 });
    expect(job.scheduledAt).not.toBeNull();
    expect(job.serialize()["scheduled_at"]).toBe(Time.now().utc().iso8601(9));
  });

  it("accepts a Duration wait", () => {
    freezeTime();
    const job = new HelloJob().set({ wait: days(1) });
    const expected = Time.now().utc().plus(86400).iso8601(9);
    expect(job.serialize()["scheduled_at"]).toBe(expected);
  });

  it("casts priority with to_i, including 0", () => {
    const job = new HelloJob().set({ priority: "0" });
    expect((job as unknown as { _priority: unknown })._priority).toBe(0);
  });

  it("ClassMethods.deserialize constantizes job_class, builds it and deserializes onto it", () => {
    const job = HelloJob.deserialize<HelloJob>({
      job_class: "HelloJob",
      job_id: "abc",
      arguments: [1],
    });
    expect(job).toBeInstanceOf(HelloJob);
    expect(job.jobId).toBe("abc");
    expect(job.serialize()["arguments"]).toEqual([1]);
  });

  it("ClassMethods.set builds a ConfiguredJob with the class and options", () => {
    class ConfiguredJob {
      constructor(
        readonly jobClass: unknown,
        readonly options: unknown,
      ) {}
    }
    rbModConstSet(ActiveJob, "ConfiguredJob", ConfiguredJob);
    const configured = HelloJob.set({ wait: 0 }) as unknown as ConfiguredJob;
    expect(configured).toBeInstanceOf(ConfiguredJob);
    expect(configured.jobClass).toBe(HelloJob);
    expect(configured.options).toEqual({ wait: 0 });
  });

  it("serializes a null scheduled_at as null, and a set one as utc iso8601(9)", () => {
    const job = new HelloJob();
    expect(job.serialize()["scheduled_at"]).toBeNull();
    job.scheduledAt = Time.iso8601("2026-01-02T03:04:05.123456789+02:00");
    expect(job.serialize()["scheduled_at"]).toBe("2026-01-02T01:04:05.123456789Z");
  });

  it("deserializes enqueued_at and scheduled_at only when present", () => {
    const job = new HelloJob();
    job.deserialize({ enqueued_at: false, scheduled_at: null });
    expect(job.enqueuedAt).toBeNull();
    expect(job.scheduledAt).toBeNull();
    job.deserialize({ scheduled_at: "2026-01-02T01:04:05.123456789Z" });
    expect(job.scheduledAt).toBeInstanceOf(Time);
    expect(job.serialize()["scheduled_at"]).toBe("2026-01-02T01:04:05.123456789Z");
  });

  it("set wait_until assigns the time as given", () => {
    const at = Time.iso8601("2026-01-02T01:04:05Z");
    expect(new HelloJob().set({ waitUntil: at }).scheduledAt).toBe(at);
  });
});
