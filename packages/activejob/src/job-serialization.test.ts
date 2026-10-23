import type {} from "@blazetrails/vitest-matchers";
import "./test-helpers/helper.js";
import { freezeTime, useZone } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { JSON } from "@blazetrails/ruby-compat";
import { GidJob } from "./test-helpers/jobs/gid-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { beforeEach, expect, it, describe } from "vitest";

describe("JobSerializationTest", () => {
  let person: unknown;

  beforeEach(() => {
    JobBuffer.clear();
    person = Person.find(5);
  });

  it("serialize job with gid", async () => {
    await GidJob.performLater(person);
    expect(JobBuffer.lastValue()).toEqual("Person with ID: 5");
  });

  it("serialize includes current locale", async () => {
    expect((await new HelloJob().serialize())["locale"]).toEqual("en");
  });

  it("serialize and deserialize are symmetric", async () => {
    freezeTime();
    const h1 = new HelloJob("Rafael");
    const h2 = HelloJob.deserialize(await h1.serialize());
    expect(await h2.serialize()).toEqualRuby(await h1.serialize());
    const payload = await JSON.dump(await h2.serialize());
    const h3 = HelloJob.deserialize((await JSON.load(payload)) as Record<string, unknown>);
    expect(await h3.serialize()).toEqualRuby(await h2.serialize());
  });

  it("deserialize sets locale", async () => {
    const job = new HelloJob();
    await job.deserialize({ locale: "es" });
    expect(await job.locale).toEqual("es");
  });

  it("deserialize sets default locale", async () => {
    const job = new HelloJob();
    await job.deserialize({});
    expect(await job.locale).toEqual("en");
  });

  it("serialize stores provider_job_id", async () => {
    const job = new HelloJob();
    expect((await job.serialize())["provider_job_id"]).toBeNull();
    job.providerJobId = "some value set by adapter";
    expect((await job.serialize())["provider_job_id"]).toEqualRuby(await job.providerJobId);
  });

  it("serialize stores the current timezone", async () => {
    await useZone("Hawaii", async () => {
      const job = new HelloJob();
      return expect((await job.serialize())["timezone"]).toEqual("Hawaii");
    });
  });

  it("serializes and deserializes enqueued_at with full precision", async () => {
    freezeTime();
    const serialized = await new HelloJob().serialize();
    expect(typeof serialized["enqueued_at"]).toBe("string");
    const enqueuedAt = await HelloJob.deserialize(serialized).enqueuedAt;
    expect(enqueuedAt).toBeInstanceOf(RubyTime);
    expect(enqueuedAt).toEqualRuby(RubyTime.now().utc());
  });

  it("serializes and deserializes scheduled_at as Time", async () => {
    freezeTime();
    const currentTime = RubyTime.now();
    const job = new HelloJob();
    job.scheduledAt = currentTime;
    const serializedJob = await job.serialize();
    expect(typeof serializedJob["enqueued_at"]).toBe("string");
    expect(serializedJob["enqueued_at"]).toEqualRuby(currentTime.utc().iso8601(9));
    const deserializedJob = new HelloJob();
    await deserializedJob.deserialize(serializedJob);
    expect(await deserializedJob.scheduledAt).toEqualRuby(currentTime);
    expect(await deserializedJob.serialize()).toEqualRuby(await job.serialize());
  });
});
