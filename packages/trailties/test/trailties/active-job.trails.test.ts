import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Trailtie as I18nTrailtie } from "../../lib/trailties/i18n.js";

beforeEach(() => {
  I18nTrailtie._i18nInited = true;
});

afterEach(() => {
  I18nTrailtie._i18nInited = false;
});
import { Deprecators, OrderedOptions, runLoadHooks } from "@blazetrails/activesupport";
import { ActiveJob, Base, Serializers } from "@blazetrails/activejob";
import { EnqueueAfterTransactionCommit } from "@blazetrails/activejob/enqueue-after-transaction-commit";
import { isModuleIncluded, constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Trailtie, type ActiveJobConfig } from "../../lib/trailties/active-job.js";
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
    await runLoadHooks("after_initialize", app);
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
    constSet(TopLevel, "ReloadedJob", ReloadedJob);
    await (Base as unknown as { execute(jobData: unknown): Promise<unknown> }).execute(
      new ReloadedJob().serialize(),
    );
    expect(wrapped).toEqual(["before", "perform", "after"]);
  });
});
