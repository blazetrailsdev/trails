import { afterEach, describe, expect, it } from "vitest";
import { constantize } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import * as ActiveJobModule from "./index.js";
import { ActiveJob, QueueAdapters, Serializers } from "./namespaces.js";

describe("ActiveJob", () => {
  afterEach(() => ActiveJobModule.setVerboseEnqueueLogs(false));

  it("resolves through constantize", () => {
    expect(constantize("ActiveJob")).toBe(ActiveJob);
    expect(constantize("ActiveJob::Base")).toBe(ActiveJobModule.Base);
  });

  it("defaults verbose_enqueue_logs to false and answers its writer", () => {
    expect(ActiveJobModule.verboseEnqueueLogs()).toBe(false);
    expect(rbObjRespondTo(ActiveJobModule, "setVerboseEnqueueLogs")).toBe(true);
    ActiveJobModule.setVerboseEnqueueLogs(true);
    expect(ActiveJobModule.verboseEnqueueLogs()).toBe(true);
  });

  it("eager-autoloads only Serializers and ConfiguredJob", () => {
    expect(ActiveJob._eagerloadedConstants).toEqual(["Serializers", "ConfiguredJob"]);
    expect(Object.keys(ActiveJob._autoloads!)).toEqual([
      "Base",
      "QueueAdapters",
      "Arguments",
      "DeserializationError",
      "SerializationError",
      "EnqueueAfterTransactionCommit",
      "Serializers",
      "ConfiguredJob",
      "TestCase",
      "TestHelper",
    ]);
  });

  it("resolves the explicit autoload path of the two argument errors", async () => {
    expect(await ActiveJob._autoloads!.DeserializationError()).toBe("active_job/arguments");
    expect(await ActiveJob._autoloads!.SerializationError()).toBe("active_job/arguments");
    expect(await ActiveJob._autoloads!.Base()).toBe("active_job/base");
  });

  it("extends QueueAdapters and Serializers with Autoload", () => {
    expect(QueueAdapters.name).toBe("ActiveJob::QueueAdapters");
    expect(Serializers.name).toBe("ActiveJob::Serializers");
    expect(typeof QueueAdapters.autoload).toBe("function");
    expect(typeof Serializers.eagerLoadBang).toBe("function");
  });
});
