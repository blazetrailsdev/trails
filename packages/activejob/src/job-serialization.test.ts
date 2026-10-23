import { beforeEach, describe, it } from "vitest";
import {
  assertEqual,
  assertKindOf,
  assertNil,
  freezeTime,
  useZone,
} from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import "./test-helpers/helper.js";
import { GidJob } from "./test-helpers/jobs/gid-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

describe("JobSerializationTest", () => {
  let person: Person;

  beforeEach(() => {
    JobBuffer.clear();
    person = Person.find(5);
  });

  it("serialize job with gid", async () => {
    await GidJob.performLater(person);
    assertEqual("Person with ID: 5", JobBuffer.lastValue());
  });

  it("serialize includes current locale", () => {
    assertEqual("en", new HelloJob().serialize()["locale"]);
  });

  it("serialize and deserialize are symmetric", () => {
    freezeTime();

    const h1 = new HelloJob("Rafael");
    const h2 = HelloJob.deserialize(h1.serialize());
    assertEqual(h1.serialize(), h2.serialize());

    const payload = JSON.stringify(h2.serialize());
    const h3 = HelloJob.deserialize(JSON.parse(payload));
    assertEqual(h2.serialize(), h3.serialize());
  });

  it("deserialize sets locale", () => {
    const job = new HelloJob();
    job.deserialize({ locale: "es" });
    assertEqual("es", job.locale);
  });

  it("deserialize sets default locale", () => {
    const job = new HelloJob();
    job.deserialize({});
    assertEqual("en", job.locale);
  });

  it("serialize stores provider_job_id", () => {
    const job = new HelloJob();
    assertNil(job.serialize()["provider_job_id"]);

    job.providerJobId = "some value set by adapter";
    assertEqual(job.providerJobId, job.serialize()["provider_job_id"]);
  });

  it("serialize stores the current timezone", () => {
    useZone("Hawaii", () => {
      const job = new HelloJob();
      assertEqual("Hawaii", job.serialize()["timezone"]);
    });
  });

  it("serializes and deserializes enqueued_at with full precision", () => {
    freezeTime();

    const serialized = new HelloJob().serialize();
    assertKindOf(String, serialized["enqueued_at"]);

    const enqueuedAt = HelloJob.deserialize(serialized).enqueuedAt;
    assertKindOf(Time, enqueuedAt);
    assertEqual(Time.now().utc(), enqueuedAt);
  });

  it("serializes and deserializes scheduled_at as Time", () => {
    freezeTime();
    const currentTime = Time.now();

    const job = new HelloJob();
    job.scheduledAt = currentTime;
    const serializedJob = job.serialize();
    assertKindOf(String, serializedJob["enqueued_at"]);
    assertEqual(currentTime.utc().iso8601(9), serializedJob["enqueued_at"]);

    const deserializedJob = new HelloJob();
    deserializedJob.deserialize(serializedJob);
    assertEqual(currentTime, deserializedJob.scheduledAt);

    assertEqual(job.serialize(), deserializedJob.serialize());
  });
});
