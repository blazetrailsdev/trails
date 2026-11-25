import { afterAll, beforeEach } from "vitest";
import {
  Logger,
  TopLevel,
  delegate,
  with as with_,
  setTrailsRoot,
} from "@blazetrails/activesupport";
import { ActiveRecord, Base, Migrator } from "@blazetrails/activerecord";
import { DatabaseTasks } from "@blazetrails/activerecord/tasks/database-tasks.js";
import { Trails } from "@blazetrails/trailties";
import { ActionController } from "@blazetrails/actionpack";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { TestCase as ChannelTestCase } from "@blazetrails/actioncable/channel/test-case.js";
import { File, Thread, include } from "@blazetrails/ruby-compat";
import { expect } from "vitest";
import { Debouncer } from "../lib/app/models/turbo/debouncer.js";
import { ThreadDebouncer } from "../lib/app/models/turbo/thread-debouncer.js";
import { Turbo } from "../lib/turbo-trails.js";
import { ApplicationController } from "./dummy/app/controllers/application-controller.js";

const configurations = Base.configurations();
Trails.env = "test";
await import("./dummy/config/environment.js");
export const app = Trails.application!;
Trails.logger = new Logger(null);
setTrailsRoot(TopLevel.Trails!.root()!.toString());
ActionController.Base.prependViewPath([File.expandPath("dummy/app/views", import.meta.dirname)]);

DatabaseTasks.root = TopLevel.Trails!.root()!.toString();

await DatabaseTasks.purge(
  Base.configurations().configsFor({
    envName: String(ActiveRecord.ConnectionHandling.DEFAULT_ENV()),
    name: "primary",
  })!,
);

Migrator.migrationsPaths = [File.expandPath("dummy/db/migrate", import.meta.dirname)];
await Base.establishConnection();
await Base.connectionPool().migrationContext.migrate();

const ActionViewTestCaseExtensions = {};
delegate.call(ActionViewTestCaseExtensions, "render", { to: ApplicationController });

beforeEach(() => {
  Turbo.currentRequestId = null;

  for (const key of Thread.current().keys()) {
    if (key.startsWith("turbo-")) Thread.current().set(key, null);
  }
});

include(IntegrationTest, ActionViewTestCaseExtensions);

include(ChannelTestCase, ActionViewTestCaseExtensions);

afterAll(async () => {
  await Base.establishConnection(configurations.configsFor({ envName: "arunit", name: "primary" }));
  Base.configurations(configurations);
});

export async function withProductionDebouncer(block: () => Promise<unknown>): Promise<void> {
  try {
    await with_(ThreadDebouncer, { debouncerClass: Debouncer }, block);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, (Debouncer.DEFAULT_DELAY + 0.2) * 1000));

    const turboKeys = Thread.current()
      .keys()
      .filter((k) => k.startsWith("turbo-"));
    expect(turboKeys, "Thread-locals were not cleaned up").toEqual([]);
  }
}
