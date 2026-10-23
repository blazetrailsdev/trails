import { describe, it, expect } from "vitest";
import { Deprecators, OrderedOptions, runLoadHooks } from "@blazetrails/activesupport";
import { ActiveJob, Base, Serializers } from "@blazetrails/activejob";
import { EnqueueAfterTransactionCommit } from "@blazetrails/activejob/enqueue-after-transaction-commit";
import { isModuleIncluded, registerConstant } from "@blazetrails/ruby-compat";
import { Trailtie, type ActiveJobConfig } from "./active-job.js";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";

class DummySerializer {
  isSerialize(): boolean {
    return false;
  }
}

describe("ActiveJob::Railtie", () => {
  it("registers config.active_job with the Rails defaults", () => {
    const activeJob = Trailtie.config.get("activeJob") as ActiveJobConfig;
    expect(activeJob.customSerializers).toEqual([]);
    expect(activeJob.logQueryTagsAroundPerform).toBe(true);
  });

  it("adds custom serializers, wraps execute in the reloader and includes EnqueueAfterTransactionCommit", async () => {
    const activeJob = new OrderedOptions() as ActiveJobConfig;
    activeJob.customSerializers = [DummySerializer];
    activeJob.logQueryTagsAroundPerform = true;
    activeJob.verboseEnqueueLogs = true;
    const wrapped: string[] = [];
    const app = {
      deprecators: new Deprecators(),
      config: { activeJob, isRespondTo: () => false },
      reloader: {
        wrap: async (block: () => Promise<unknown>) => {
          wrapped.push("before");
          const result = await block();
          wrapped.push("after");
          return result;
        },
      },
    };

    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("after_initialize", app);
    runLoadHooks("active_record", {});

    expect(Serializers.serializers().has(DummySerializer as never)).toBe(true);
    expect(isModuleIncluded(Base, EnqueueAfterTransactionCommit)).toBe(true);
    expect(ActiveJob.verboseEnqueueLogs()).toBe(true);
    expect(activeJob.queueAdapter).toBe("test");
    expect(Base.queueAdapterName).toBe("test");

    class ReloadedJob extends Base {
      perform(): void {
        wrapped.push("perform");
      }
    }
    registerConstant("ReloadedJob", ReloadedJob);
    await (Base as unknown as { execute(jobData: unknown): Promise<unknown> }).execute(
      new ReloadedJob().serialize(),
    );
    expect(wrapped).toEqual(["before", "perform", "after"]);
  });
});
