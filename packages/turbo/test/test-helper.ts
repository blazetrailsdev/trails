import { afterAll } from "vitest";
import { Logger, TopLevel, objectWith, setTrailsRoot } from "@blazetrails/activesupport";
import { ActiveRecord, Base, DatabaseTasks, Migrator } from "@blazetrails/activerecord";
import { Trails } from "@blazetrails/trailties";
import { ActionController } from "@blazetrails/actionpack";
import { File, Thread } from "@blazetrails/ruby-compat";
import { expect } from "vitest";
import { Debouncer } from "../lib/app/models/turbo/debouncer.js";
import { ThreadDebouncer } from "../lib/app/models/turbo/thread-debouncer.js";

const configurations = Base.configurations();
Trails.env = "test";
await import("./dummy/config/environment.js");
export const app = Trails.application!;
Trails.logger = new Logger(null);
setTrailsRoot(TopLevel.Trails!.root()!);
ActionController.Base.prependViewPath([File.expandPath("dummy/app/views", import.meta.dirname)]);

DatabaseTasks.root = TopLevel.Trails!.root()!;

await DatabaseTasks.purge(
  Base.configurations().configsFor({
    envName: String(ActiveRecord.ConnectionHandling.DEFAULT_ENV()),
    name: "primary",
  })!,
);

Migrator.migrationsPaths = [File.expandPath("dummy/db/migrate", import.meta.dirname)];
await Base.establishConnection();
await Base.connectionPool().migrationContext.migrate();

afterAll(async () => {
  await Base.establishConnection(configurations.configsFor({ envName: "arunit", name: "primary" }));
  Base.configurations(configurations);
});

export async function withProductionDebouncer(block: () => Promise<unknown>): Promise<void> {
  try {
    await objectWith(ThreadDebouncer, { debouncerClass: Debouncer }, block);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, (Debouncer.DEFAULT_DELAY + 0.2) * 1000));

    const turboKeys = Thread.current()
      .keys()
      .filter((k) => k.startsWith("turbo-"));
    expect(turboKeys, "Thread-locals were not cleaned up").toEqual([]);
  }
}
