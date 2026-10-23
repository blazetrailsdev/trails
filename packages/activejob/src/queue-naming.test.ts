import { beforeEach, describe, expect, it } from "vitest";
import { Base } from "./base.js";
import "./test-helpers/helper.js";
import { ConfigurationJob } from "./test-helpers/jobs/configuration-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { PrefixedJob } from "./test-helpers/jobs/prefixed-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

type ConfiguredJob = { performNow(): Promise<unknown>; performLater(): Promise<unknown> };

describe("QueueNamingTest", () => {
  beforeEach(() => {
    JobBuffer.clear();
  });

  it("name derived from base", () => {
    expect(new HelloJob().queueName).toBe("default");
  });

  it("uses given queue name job", () => {
    const originalQueueName = HelloJob.queueName;

    try {
      HelloJob.queueAs("greetings");
      expect(new HelloJob().queueName).toBe("greetings");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });

  it("allows a blank queue name", () => {
    const originalQueueName = HelloJob.queueName;

    try {
      HelloJob.queueAs("");
      expect(new HelloJob().queueName).toBe("");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });

  it("does not use a nil queue name", () => {
    const originalQueueName = HelloJob.queueName;

    try {
      HelloJob.queueAs(null);
      expect(new HelloJob().queueName).toBe("default");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });

  it("evals block given to queue_as to determine queue", () => {
    const originalQueueName = HelloJob.queueName;

    try {
      HelloJob.queueAs(undefined, () => "another");
      expect(new HelloJob().queueName).toBe("another");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });

  it("can use arguments to determine queue_name in queue_as block", () => {
    const originalQueueName = HelloJob.queueName;

    try {
      HelloJob.queueAs(undefined, function (this: unknown) {
        return (this as HelloJob).arguments[0] === "1" ? "one" : "two";
      });
      expect(new HelloJob("1").queueName).toBe("one");
      expect(new HelloJob("3").queueName).toBe("two");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });

  it("queue_name_prefix prepended to the queue name with default delimiter", () => {
    const originalQueueNamePrefix = Base.queueNamePrefix;
    const originalQueueName = HelloJob.queueName;

    try {
      Base.queueNamePrefix = "aj";
      HelloJob.queueAs("low");
      expect(HelloJob.queueName).toBe("aj_low");
    } finally {
      Base.queueNamePrefix = originalQueueNamePrefix;
      HelloJob.queueName = originalQueueName;
    }
  });

  it("queue_name_prefix prepended to the queue name with custom delimiter", () => {
    const originalQueueNamePrefix = Base.queueNamePrefix;
    const originalQueueNameDelimiter = Base.queueNameDelimiter;
    const originalQueueName = HelloJob.queueName;

    try {
      Base.queueNameDelimiter = ".";
      Base.queueNamePrefix = "aj";
      HelloJob.queueAs("low");
      expect(HelloJob.queueName).toBe("aj.low");
    } finally {
      Base.queueNamePrefix = originalQueueNamePrefix;
      Base.queueNameDelimiter = originalQueueNameDelimiter;
      HelloJob.queueName = originalQueueName;
    }
  });

  it("using a custom default_queue_name", () => {
    const originalDefaultQueueName = Base.defaultQueueName;

    try {
      Base.defaultQueueName = "default_queue_name";

      expect(new HelloJob().queueName).toBe("default_queue_name");
    } finally {
      Base.defaultQueueName = originalDefaultQueueName;
    }
  });

  it("queue_name_prefix prepended to the default_queue_name", () => {
    const originalQueueNamePrefix = Base.queueNamePrefix;
    const originalDefaultQueueName = Base.defaultQueueName;

    try {
      Base.queueNamePrefix = "prefix";
      Base.defaultQueueName = "default_queue_name";

      expect(new HelloJob().queueName).toBe("prefix_default_queue_name");
    } finally {
      Base.queueNamePrefix = originalQueueNamePrefix;
      Base.defaultQueueName = originalDefaultQueueName;
    }
  });

  it("can change queue_name_prefix in a job class definition without affecting other jobs", () => {
    expect(PrefixedJob.queueNamePrefix).toBe("production");
    expect(HelloJob.queueNamePrefix).toBeNull();
  });

  it("can change queue_name_prefix in a job class without affecting other jobs", () => {
    const originalPrefix = PrefixedJob.queueNamePrefix;

    try {
      PrefixedJob.queueNamePrefix = "staging";

      expect(PrefixedJob.queueNamePrefix).toBe("staging");
      expect(HelloJob.queueNamePrefix).toBeNull();
    } finally {
      PrefixedJob.queueNamePrefix = originalPrefix;
    }
  });

  it("is assigned when perform_now", async () => {
    await (ConfigurationJob.set({ queue: "some_queue" }) as ConfiguredJob).performNow();
    const job = JobBuffer.lastValue() as ConfigurationJob;
    expect(job.queueName).toBe("some_queue");
  });

  it("is assigned when perform_later", async () => {
    await (ConfigurationJob.set({ queue: "some_queue" }) as ConfiguredJob).performLater();
    const job = JobBuffer.lastValue() as ConfigurationJob;
    expect(job.queueName).toBe("some_queue");
  });
});
