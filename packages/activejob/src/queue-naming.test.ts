import "./test-helpers/helper.js";
import { Base } from "./base.js";
import { ConfigurationJob } from "./test-helpers/jobs/configuration-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { PrefixedJob } from "./test-helpers/jobs/prefixed-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { beforeEach, expect, it, describe } from "vitest";

describe("QueueNamingTest", () => {
  beforeEach(() => {
    JobBuffer.clear();
  });

  it("name derived from base", async () => {
    expect(await new HelloJob().queueName).toEqual("default");
  });

  it("uses given queue name job", async () => {
    const originalQueueName = await HelloJob.queueName;
    try {
      HelloJob.queueAs("greetings");
      expect(await new HelloJob().queueName).toEqual("greetings");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });

  it("allows a blank queue name", async () => {
    const originalQueueName = await HelloJob.queueName;
    try {
      HelloJob.queueAs("");
      expect(await new HelloJob().queueName).toEqual("");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });

  it("does not use a nil queue name", async () => {
    const originalQueueName = await HelloJob.queueName;
    try {
      HelloJob.queueAs(null);
      expect(await new HelloJob().queueName).toEqual("default");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });

  it("evals block given to queue_as to determine queue", async () => {
    const originalQueueName = await HelloJob.queueName;
    try {
      await HelloJob.queueAs(undefined, function () {
        return "another";
      });
      expect(await new HelloJob().queueName).toEqual("another");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });

  it("can use arguments to determine queue_name in queue_as block", async () => {
    const originalQueueName = await HelloJob.queueName;
    try {
      await HelloJob.queueAs(undefined, function () {
        if (this.arguments[0] === "1") {
          return "one";
        } else {
          return "two";
        }
      });
      expect(await new HelloJob("1").queueName).toEqual("one");
      expect(await new HelloJob("3").queueName).toEqual("two");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });

  it("queue_name_prefix prepended to the queue name with default delimiter", async () => {
    const originalQueueNamePrefix = await Base.queueNamePrefix;
    const originalQueueName = await HelloJob.queueName;
    try {
      Base.queueNamePrefix = "aj";
      HelloJob.queueAs("low");
      expect(await HelloJob.queueName).toEqual("aj_low");
    } finally {
      Base.queueNamePrefix = originalQueueNamePrefix;
      HelloJob.queueName = originalQueueName;
    }
  });

  it("queue_name_prefix prepended to the queue name with custom delimiter", async () => {
    const originalQueueNamePrefix = await Base.queueNamePrefix;
    const originalQueueNameDelimiter = await Base.queueNameDelimiter;
    const originalQueueName = await HelloJob.queueName;
    try {
      Base.queueNameDelimiter = ".";
      Base.queueNamePrefix = "aj";
      HelloJob.queueAs("low");
      expect(await HelloJob.queueName).toEqual("aj.low");
    } finally {
      Base.queueNamePrefix = originalQueueNamePrefix;
      Base.queueNameDelimiter = originalQueueNameDelimiter;
      HelloJob.queueName = originalQueueName;
    }
  });

  it("using a custom default_queue_name", async () => {
    const originalDefaultQueueName = Base.defaultQueueName;
    try {
      Base.defaultQueueName = "default_queue_name";
      expect(await new HelloJob().queueName).toEqual("default_queue_name");
    } finally {
      Base.defaultQueueName = originalDefaultQueueName;
    }
  });

  it("queue_name_prefix prepended to the default_queue_name", async () => {
    const originalQueueNamePrefix = await Base.queueNamePrefix;
    const originalDefaultQueueName = Base.defaultQueueName;
    try {
      Base.queueNamePrefix = "prefix";
      Base.defaultQueueName = "default_queue_name";
      expect(await new HelloJob().queueName).toEqual("prefix_default_queue_name");
    } finally {
      Base.queueNamePrefix = originalQueueNamePrefix;
      Base.defaultQueueName = originalDefaultQueueName;
    }
  });

  it("can change queue_name_prefix in a job class definition without affecting other jobs", async () => {
    expect(await PrefixedJob.queueNamePrefix).toEqual("production");
    expect(await HelloJob.queueNamePrefix).toBeNull();
  });

  it("can change queue_name_prefix in a job class without affecting other jobs", async () => {
    const originalPrefix = await PrefixedJob.queueNamePrefix;
    try {
      PrefixedJob.queueNamePrefix = "staging";
      expect(await PrefixedJob.queueNamePrefix).toEqual("staging");
      expect(await HelloJob.queueNamePrefix).toBeNull();
    } finally {
      PrefixedJob.queueNamePrefix = originalPrefix;
    }
  });

  it("is assigned when perform_now", async () => {
    await ConfigurationJob.set({ queue: "some_queue" }).performNow();
    const job = JobBuffer.lastValue();
    expect(await job.queueName).toEqual("some_queue");
  });

  it("is assigned when perform_later", async () => {
    await ConfigurationJob.set({ queue: "some_queue" }).performLater();
    const job = JobBuffer.lastValue();
    expect(await job.queueName).toEqual("some_queue");
  });
});
