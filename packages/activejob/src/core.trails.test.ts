import { afterEach, describe, expect, it } from "vitest";
import { days, freezeTime, travelBack, useZone } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { rbHashSRuby2KeywordsHashP, registerConstant } from "@blazetrails/ruby-compat";
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
});
