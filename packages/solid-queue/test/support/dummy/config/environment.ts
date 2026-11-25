import { getEnv } from "@blazetrails/activesupport";
import { Base, HashConfig } from "@blazetrails/activerecord";
import "@blazetrails/trailties/all";
import { Trailtie as ActiveJobTrailtie } from "@blazetrails/trailties/trailties/active-job";
import "../../../../lib/active-job/queue-adapters/solid-queue-adapter.js";
import { Engine } from "../../../../lib/engine.js";
import { app } from "./application.js";
import "./initializers/solid-queue-record.js";

const [primaryConfig, ...dummyConfigs] = (
  JSON.parse(getEnv("SOLID_QUEUE_DUMMY_DATABASES")!) as {
    envName: string;
    name: string;
    configuration: Record<string, unknown>;
  }[]
).map(({ envName, name, configuration }) => new HashConfig(envName, name, configuration));
Base.configurations([primaryConfig, ...dummyConfigs]);
await Base.establishConnection(primaryConfig);
Engine.config.solidQueue.connectsTo = { database: { writing: ":queue" } };

for (const railtie of [ActiveJobTrailtie, Engine]) {
  for (const initializer of railtie.initializers.tsort()) {
    await initializer.bind(railtie.instance()).run(app);
  }
}

await import("../../job-result.js");
await import("../../add-to-buffer-job.js");
await import("../../batch-completion-job.js");
await import("../../discardable-update-result-job.js");
await import("../../large-error-message-job.js");
await import("../../non-overlapping-update-result-job.js");
await import("../../provider-job-id-job.js");
await import("../../raising-job.js");
await import("../../stalled-worker.js");
await import("../../throttled-update-result-job.js");
await import("../../update-result-job.js");
