import "./test-helpers/helper.js";
import "@blazetrails/activesupport/testing/autorun";
import { first, rbEqual, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { TestHost } from "./codegen-runtime.js";
import { ConfigurationJob } from "./test-helpers/jobs/configuration-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { PrefixedJob } from "./test-helpers/jobs/prefixed-job.js";
import { clear, lastValue } from "./test-helpers/support/job-buffer.js";
import { describe, beforeEach, it, expect, afterEach } from "vitest";

describe("QueueNamingTest", () => {
  class QueueNamingTest extends TestHost {}
  registerConstant("QueueNamingTest", QueueNamingTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  beforeEach(async ({ testCase }: any) => {
    await clear();
  });
  it("name derived from base", async ({ testCase }: any) => {
    expect(await new HelloJob().queueName).toEqual("default");
  });
  it("uses given queue name job", async ({ testCase }: any) => {
    const originalQueueName: any = await HelloJob.queueName;
    try {
      await HelloJob.queueAs("greetings");
      expect(await new HelloJob().queueName).toEqual("greetings");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });
  it("allows a blank queue name", async ({ testCase }: any) => {
    const originalQueueName: any = await HelloJob.queueName;
    try {
      await HelloJob.queueAs("");
      expect(await new HelloJob().queueName).toEqual("");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });
  it("does not use a nil queue name", async ({ testCase }: any) => {
    const originalQueueName: any = await HelloJob.queueName;
    try {
      await HelloJob.queueAs(null);
      expect(await new HelloJob().queueName).toEqual("default");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });
  it("evals block given to queue_as to determine queue", async ({ testCase }: any) => {
    const originalQueueName: any = await HelloJob.queueName;
    try {
      await HelloJob.queueAs(undefined, function (this: any) {
        return "another";
      });
      expect(await new HelloJob().queueName).toEqual("another");
    } finally {
      HelloJob.queueName = originalQueueName;
    }
  });
  it("can use arguments to determine queue_name in queue_as block", async ({ testCase }: any) => {
    const originalQueueName: any = await HelloJob.queueName;
    try {
      await HelloJob.queueAs(undefined, function (this: any) {
        if (rbEqual(first(this.arguments), "1")) {
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
  it("queue_name_prefix prepended to the queue name with default delimiter", async ({
    testCase,
  }: any) => {
    const originalQueueNamePrefix: any = await Base.queueNamePrefix;
    const originalQueueName: any = await HelloJob.queueName;
    try {
      Base.queueNamePrefix = "aj";
      await HelloJob.queueAs("low");
      expect(await HelloJob.queueName).toEqual("aj_low");
    } finally {
      Base.queueNamePrefix = originalQueueNamePrefix;
      HelloJob.queueName = originalQueueName;
    }
  });
  it("queue_name_prefix prepended to the queue name with custom delimiter", async ({
    testCase,
  }: any) => {
    const originalQueueNamePrefix: any = await Base.queueNamePrefix;
    const originalQueueNameDelimiter: any = await Base.queueNameDelimiter;
    const originalQueueName: any = await HelloJob.queueName;
    try {
      Base.queueNameDelimiter = ".";
      Base.queueNamePrefix = "aj";
      await HelloJob.queueAs("low");
      expect(await HelloJob.queueName).toEqual("aj.low");
    } finally {
      Base.queueNamePrefix = originalQueueNamePrefix;
      Base.queueNameDelimiter = originalQueueNameDelimiter;
      HelloJob.queueName = originalQueueName;
    }
  });
  it("using a custom default_queue_name", async ({ testCase }: any) => {
    const originalDefaultQueueName: any = await Base.defaultQueueName;
    try {
      Base.defaultQueueName = "default_queue_name";
      expect(await new HelloJob().queueName).toEqual("default_queue_name");
    } finally {
      Base.defaultQueueName = originalDefaultQueueName;
    }
  });
  it("queue_name_prefix prepended to the default_queue_name", async ({ testCase }: any) => {
    const originalQueueNamePrefix: any = await Base.queueNamePrefix;
    const originalDefaultQueueName: any = await Base.defaultQueueName;
    try {
      Base.queueNamePrefix = "prefix";
      Base.defaultQueueName = "default_queue_name";
      expect(await new HelloJob().queueName).toEqual("prefix_default_queue_name");
    } finally {
      Base.queueNamePrefix = originalQueueNamePrefix;
      Base.defaultQueueName = originalDefaultQueueName;
    }
  });
  it("can change queue_name_prefix in a job class definition without affecting other jobs", async ({
    testCase,
  }: any) => {
    expect(await PrefixedJob.queueNamePrefix).toEqual("production");
    expect((await HelloJob.queueNamePrefix) ?? null).toBeNull();
  });
  it("can change queue_name_prefix in a job class without affecting other jobs", async ({
    testCase,
  }: any) => {
    const originalPrefix: any = await PrefixedJob.queueNamePrefix;
    try {
      PrefixedJob.queueNamePrefix = "staging";
      expect(await PrefixedJob.queueNamePrefix).toEqual("staging");
      expect((await HelloJob.queueNamePrefix) ?? null).toBeNull();
    } finally {
      PrefixedJob.queueNamePrefix = originalPrefix;
    }
  });
  it("is assigned when perform_now", async ({ testCase }: any) => {
    await await (await ConfigurationJob.set({ queue: "some_queue" })).performNow();
    const job: any = await lastValue();
    expect(await job.queueName).toEqual("some_queue");
  });
  it("is assigned when perform_later", async ({ testCase }: any) => {
    await await (await ConfigurationJob.set({ queue: "some_queue" })).performLater();
    const job: any = await lastValue();
    expect(await job.queueName).toEqual("some_queue");
  });
});
