import "./test-helpers/helper.js";
import { useZone } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import { Time as RubyTime } from "@blazetrails/date";
import { JSON, rbCString, rbObjIsKindOf, registerConstant } from "@blazetrails/ruby-compat";
import { TestHost } from "./codegen-runtime.js";
import { GidJob } from "./test-helpers/jobs/gid-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { Person } from "./test-helpers/models/person.js";
import { clear, lastValue } from "./test-helpers/support/job-buffer.js";
import { describe, beforeEach, it, expect, afterEach } from "vitest";

describe("JobSerializationTest", () => {
  class JobSerializationTest extends TestHost {}
  registerConstant("JobSerializationTest", JobSerializationTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  beforeEach(async ({ testCase }: any) => {
    await clear();
    testCase._person = await Person.find(5);
  });
  it("serialize job with gid", async ({ testCase }: any) => {
    await await GidJob.performLater(testCase._person);
    expect(await lastValue()).toEqual("Person with ID: 5");
  });
  it("serialize includes current locale", async ({ testCase }: any) => {
    expect(await (await new HelloJob().serialize())["locale"]).toEqual("en");
  });
  it("serialize and deserialize are symmetric", async ({ testCase }: any) => {
    await testCase.freezeTime();
    const h1: any = new HelloJob("Rafael");
    const h2: any = await HelloJob.deserialize(await h1.serialize());
    expect(await h2.serialize()).toEqual(await h1.serialize());
    const payload: any = await JSON.dump(await h2.serialize());
    const h3: any = await HelloJob.deserialize(await JSON.load(payload));
    expect(await h3.serialize()).toEqual(await h2.serialize());
  });
  it("deserialize sets locale", async ({ testCase }: any) => {
    const job: any = new HelloJob();
    await job.deserialize({ ["locale"]: "es" });
    expect(await job.locale).toEqual("es");
  });
  it("deserialize sets default locale", async ({ testCase }: any) => {
    const job: any = new HelloJob();
    await job.deserialize({});
    expect(await job.locale).toEqual("en");
  });
  it("serialize stores provider_job_id", async ({ testCase }: any) => {
    const job: any = new HelloJob();
    expect((await (await job.serialize())["provider_job_id"]) ?? null).toBeNull();
    job.providerJobId = "some value set by adapter";
    expect(await (await job.serialize())["provider_job_id"]).toEqual(await job.providerJobId);
  });
  it("serialize stores the current timezone", async ({ testCase }: any) => {
    await useZone("Hawaii", async () => {
      const job: any = new HelloJob();
      return expect(await (await job.serialize())["timezone"]).toEqual("Hawaii");
    });
  });
  it("serializes and deserializes enqueued_at with full precision", async ({ testCase }: any) => {
    await testCase.freezeTime();
    const serialized: any = await new HelloJob().serialize();
    expect(rbObjIsKindOf(await serialized["enqueued_at"], rbCString)).toBe(true);
    const enqueuedAt: any = await (await HelloJob.deserialize(serialized)).enqueuedAt;
    expect(rbObjIsKindOf(enqueuedAt, RubyTime)).toBe(true);
    expect(enqueuedAt).toEqual(await (await RubyTime.now()).utc());
  });
  it("serializes and deserializes scheduled_at as Time", async ({ testCase }: any) => {
    await testCase.freezeTime();
    const currentTime: any = await RubyTime.now();
    const job: any = new HelloJob();
    job.scheduledAt = currentTime;
    const serializedJob: any = await job.serialize();
    expect(rbObjIsKindOf(await serializedJob["enqueued_at"], rbCString)).toBe(true);
    expect(await serializedJob["enqueued_at"]).toEqual(await (await currentTime.utc()).iso8601(9));
    const deserializedJob: any = new HelloJob();
    await deserializedJob.deserialize(serializedJob);
    expect(await deserializedJob.scheduledAt).toEqual(currentTime);
    expect(await deserializedJob.serialize()).toEqual(await job.serialize());
  });
});
