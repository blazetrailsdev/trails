import { describe, expect, it } from "vitest";
import { constantize } from "@blazetrails/activesupport";
import { rbEqual } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { ApplicationJob } from "./jobs/application-job.js";
import { ArgumentsRoundTripJob } from "./jobs/arguments-round-trip-job.js";
import { ConfigurationJob } from "./jobs/configuration-job.js";
import { GidJob } from "./jobs/gid-job.js";
import { InheritedJob } from "./jobs/inherited-job.js";
import { KwargsJob } from "./jobs/kwargs-job.js";
import { PrefixedJob } from "./jobs/prefixed-job.js";
import { ProviderJidJob } from "./jobs/provider-jid-job.js";
import { QueueAdapterJob } from "./jobs/queue-adapter-job.js";
import { Person } from "./models/person.js";
import { Parameters } from "./support/stubs/strong-parameters.js";
import { JobBuffer } from "./support/job-buffer.js";

describe("canonical job fixtures", () => {
  it("registers each fixture under its Ruby name", () => {
    for (const klass of [
      ApplicationJob,
      ArgumentsRoundTripJob,
      ConfigurationJob,
      GidJob,
      InheritedJob,
      KwargsJob,
      PrefixedJob,
      ProviderJidJob,
      QueueAdapterJob,
      Person,
      Parameters,
    ]) {
      expect(constantize(String(klass))).toBe(klass);
    }
    expect(constantize("Person::RecordNotFound")).toBe(Person.RecordNotFound);
  });

  it("mirrors the class-level configuration of each fixture", () => {
    expect(Object.getPrototypeOf(InheritedJob)).toBe(ApplicationJob);
    expect(InheritedJob.queueAdapterName).toBe("inline");
    expect(QueueAdapterJob.queueAdapterName).toBe("inline");
    expect(PrefixedJob.queueNamePrefix).toBe("production");
    expect(Base.queueNamePrefix).not.toBe("production");
  });

  it("defaults KwargsJob's argument only for an absent key", async () => {
    JobBuffer.clear();
    new KwargsJob().perform();
    new KwargsJob().perform({ argument: null });
    expect(JobBuffer.values()).toEqual(["Job with argument: 1", "Job with argument: "]);
  });

  it("compares Person by id.to_s and raises RecordNotFound for 404", () => {
    expect(rbEqual(new Person(9), new Person("9"))).toBe(true);
    expect(rbEqual(new Person(9), 9)).toBe(false);
    expect(rbEqual(new Person(null), new Person(""))).toBe(true);
    expect(() => Person.find("404")).toThrow(Person.RecordNotFound);
    expect(new Parameters({ a: 1 }).toH()).toEqual({ a: 1 });
  });
});
