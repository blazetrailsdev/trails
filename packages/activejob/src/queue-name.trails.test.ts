import { describe, expect, it } from "vitest";
import { BigDecimal, Range } from "@blazetrails/ruby-compat";
import "./index.js";
import { deserialize, serialize } from "./arguments.js";
import { Base } from "./base.js";
import { SerializationError } from "./arguments.js";

async function performRoundTrip(args: unknown[]): Promise<unknown[]> {
  return deserialize(JSON.parse(JSON.stringify(serialize(args))));
}

describe("ActiveJob::QueueName", () => {
  it("strips a Symbol's colon and keeps a String, under a present prefix", () => {
    class PrefixedJob extends Base {}
    expect(new PrefixedJob().queueName).toBe("default");
    PrefixedJob.queueAs(":low_priority");
    expect(new PrefixedJob().queueName).toBe("low_priority");
    PrefixedJob.queueNamePrefix = "aj";
    PrefixedJob.queueAs("high");
    expect(new PrefixedJob().queueName).toBe("aj_high");
    PrefixedJob.queueNameDelimiter = ".";
    PrefixedJob.queueAs("high");
    expect(new PrefixedJob().queueName).toBe("aj.high");
    PrefixedJob.queueNamePrefix = " ";
    PrefixedJob.queueAs("high");
    expect(new PrefixedJob().queueName).toBe("high");
    expect(Base.queueNamePrefix == null).toBe(true);
  });

  it("evaluates a queue_as block against the job and memoizes it", () => {
    class BlockJob extends Base {}
    let calls = 0;
    BlockJob.queueAs(null, function () {
      calls++;
      return (this as unknown as BlockJob).arguments[0];
    });
    const job = new BlockJob(":dynamic");
    expect(job.queueName).toBe("dynamic");
    expect(job.queueName).toBe("dynamic");
    expect(calls).toBe(1);
  });
});

describe("ActiveJob::QueuePriority", () => {
  it("stores a priority and evaluates a priority block", () => {
    class PriorityJob extends Base {}
    expect(new PriorityJob().priority == null).toBe(true);
    PriorityJob.queueWithPriority(10);
    expect(new PriorityJob().priority).toBe(10);
    PriorityJob.queueWithPriority(null, () => 50);
    expect(new PriorityJob().priority).toBe(50);
    expect(Base.priority == null).toBe(true);
  });
});

describe("ActiveJob scalar serializers", () => {
  it("round-trips a Symbol, a Module, a Range and a BigDecimal", async () => {
    const range = new Range(1, null, true);
    const [sym, mod, rng, dec] = (await performRoundTrip([
      ":foo",
      Base,
      range,
      new BigDecimal("5"),
    ])) as [string, unknown, Range, BigDecimal];
    expect(sym).toBe(":foo");
    expect(mod).toBe(Base);
    expect([rng.begin, rng.end, rng.excludeEnd]).toEqual([1, null, true]);
    expect(dec.toString()).toBe(new BigDecimal("5").toString());
    expect((serialize([":foo"])[0] as Record<string, unknown>)["value"]).toBe("foo");
  });

  it("raises ArgumentError for an invalid BigDecimal string", async () => {
    await expect(
      deserialize([{ _aj_serialized: "ActiveJob::Serializers::BigDecimalSerializer", value: "x" }]),
    ).rejects.toThrow('invalid value for BigDecimal(): "x"');
  });

  it("refuses an anonymous class", () => {
    expect(() => serialize([class {}])).toThrow(SerializationError);
  });
});
