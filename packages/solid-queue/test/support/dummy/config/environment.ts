import { getEnv } from "@blazetrails/activesupport";
import { Base, HashConfig } from "@blazetrails/activerecord";
import "@blazetrails/sqlite3/better-sqlite3";
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

for (const job of [
  "../../job-result.js",
  "../../add-to-buffer-job.js",
  "../../batch-completion-job.js",
  "../../discardable-update-result-job.js",
  "../../large-error-message-job.js",
  "../../non-overlapping-update-result-job.js",
  "../../provider-job-id-job.js",
  "../../raising-job.js",
  "../../throttled-update-result-job.js",
  "../../update-result-job.js",
]) {
  await import(job);
}
