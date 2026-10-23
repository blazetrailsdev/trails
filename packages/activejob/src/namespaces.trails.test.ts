import { describe, expect, it } from "vitest";
import { constantize } from "@blazetrails/activesupport";
import { ActiveJob, QueueAdapters, Serializers } from "./namespaces.js";

describe("ActiveJob namespaces", () => {
  it("eager-loads Serializers and ConfiguredJob through loadPath", async () => {
    await ActiveJob.eagerLoadBang();
    expect(ActiveJob.Serializers).toBeDefined();
    expect(ActiveJob.ConfiguredJob).toBeDefined();
    expect(constantize("ActiveJob::Serializers::SymbolSerializer")).toBe(
      ActiveJob.Serializers.SymbolSerializer,
    );
  });

  it("has a loadPath entry for every ported autoload in active_job.rb, queue_adapters.rb and serializers.rb", async () => {
    const autoloads = [
      ...["base", "queue_adapters", "arguments", "enqueue_after_transaction_commit"],
      ...["serializers", "configured_job"],
      ...["abstract", "inline", "test"].map((a) => `queue_adapters/${a}_adapter`),
      ...["object", "time_object", "symbol", "duration", "date_time", "date"]
        .concat(["time_with_zone", "time", "module", "range", "big_decimal"])
        .map((s) => `serializers/${s}_serializer`),
    ];
    for (const path of autoloads) {
      expect(ActiveJob.loadPath[`active_job/${path}`], path).toBeTypeOf("function");
      await ActiveJob.loadPath[`active_job/${path}`]();
    }
    expect(constantize("ActiveJob::QueueAdapters::TestAdapter")).toBe(QueueAdapters.TestAdapter);
    expect(constantize("ActiveJob::Serializers::TimeSerializer")).toBe(Serializers.TimeSerializer);
  });
});
